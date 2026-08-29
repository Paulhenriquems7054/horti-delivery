import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getImportableProducts,
  type ExistingProductIdentifiers,
} from "@/lib/productImport/validateRows";
import type {
  ImportableProduct,
  ImportPreviewStats,
  ParsedImportRow,
} from "@/lib/productImport/types";
import { IMPORT_BATCH_SIZE } from "@/lib/productImport/types";

export interface ImportExecutionResult {
  importId: string;
  inserted: number;
  skippedExisting: number;
  errors: number;
  totalProcessed: number;
}

export function useProductSpreadsheetImport(storeId: string | undefined) {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const fetchExistingIdentifiers = useCallback(async (): Promise<ExistingProductIdentifiers> => {
    if (!storeId) {
      return { internalCodes: new Set(), barcodes: new Set(), namesLower: new Set() };
    }

    const { data, error } = await supabase
      .from("products")
      .select("internal_code, barcode, name")
      .eq("store_id", storeId)
      .eq("active", true);

    if (error) throw error;

    const internalCodes = new Set<string>();
    const barcodes = new Set<string>();
    const namesLower = new Set<string>();

    for (const row of data ?? []) {
      const record = row as { internal_code?: string | null; barcode?: string | null; name?: string };
      if (record.internal_code) internalCodes.add(record.internal_code);
      if (record.barcode) barcodes.add(record.barcode);
      if (record.name) namesLower.add(record.name.toLowerCase());
    }

    return { internalCodes, barcodes, namesLower };
  }, [storeId]);

  const importProducts = useCallback(
    async (
      filename: string,
      rows: ParsedImportRow[],
      stats: ImportPreviewStats,
    ): Promise<ImportExecutionResult> => {
      if (!storeId) throw new Error("Loja não carregada");

      const products = getImportableProducts(rows);
      if (products.length === 0) {
        throw new Error("Nenhum produto válido para importar");
      }

      setIsImporting(true);
      setProgress({ done: 0, total: products.length });

      let inserted = 0;
      let skippedExisting = 0;
      let errors = 0;

      try {
        const { data: importId, error: beginError } = await supabase.rpc("begin_product_import", {
          p_filename: filename,
          p_total_rows: stats.totalRows,
        });

        if (beginError) throw beginError;
        if (!importId) throw new Error("Falha ao iniciar importação");

        for (let offset = 0; offset < products.length; offset += IMPORT_BATCH_SIZE) {
          const batch = products.slice(offset, offset + IMPORT_BATCH_SIZE);
          const payload = batch.map(toRpcItem);

          const { data: batchResult, error: batchError } = await supabase.rpc("import_product_batch", {
            p_import_id: importId,
            p_items: payload,
          });

          if (batchError) throw batchError;

          const result = batchResult as {
            inserted?: number;
            skipped_existing?: number;
            errors?: number;
          };

          inserted += result.inserted ?? 0;
          skippedExisting += result.skipped_existing ?? 0;
          errors += result.errors ?? 0;
          setProgress({ done: Math.min(offset + batch.length, products.length), total: products.length });
        }

        const { error: finishError } = await supabase.rpc("finish_product_import", {
          p_import_id: importId,
          p_metadata: {
            client_valid_rows: stats.validRows,
            client_invalid_rows: stats.invalidRows,
            client_duplicate_rows: stats.duplicateRows,
            client_duplicate_existing_rows: stats.duplicateExistingRows,
          },
        });

        if (finishError) throw finishError;

        return {
          importId,
          inserted,
          skippedExisting,
          errors,
          totalProcessed: products.length,
        };
      } finally {
        setIsImporting(false);
      }
    },
    [storeId],
  );

  return {
    fetchExistingIdentifiers,
    importProducts,
    isImporting,
    progress,
  };
}

function toRpcItem(product: ImportableProduct) {
  return {
    internal_code: product.internal_code,
    barcode: product.barcode,
    name: product.name,
    price: product.price,
    source_row: product.sourceRow,
  };
}

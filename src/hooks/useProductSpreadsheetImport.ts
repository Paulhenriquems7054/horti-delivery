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
  classifiedOnInsert: number;
  pendingReview: number;
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

  const ensureCategories = useCallback(async (): Promise<Map<string, string>> => {
    const { data, error } = await supabase.rpc("ensure_store_catalog_categories");
    if (error) throw error;

    const map = new Map<string, string>();
    const payload = data as {
      categories?: Array<{ id: string; name: string }>;
    } | null;

    for (const cat of payload?.categories ?? []) {
      map.set(cat.name, cat.id);
    }
    return map;
  }, []);

  const importProducts = useCallback(
    async (
      filename: string,
      rows: ParsedImportRow[],
      stats: ImportPreviewStats,
    ): Promise<ImportExecutionResult> => {
      if (!storeId) throw new Error("Loja não carregada");

      const categoryMap = await ensureCategories();
      const products = getImportableProducts(rows, categoryMap);
      if (products.length === 0) {
        throw new Error("Nenhum produto válido para importar");
      }

      const classifiedOnInsert = products.filter((p) => !!p.category_id).length;
      const pendingReview = products.filter((p) => !p.category_id).length;

      setIsImporting(true);
      setProgress({ done: 0, total: products.length });

      let inserted = 0;
      let skippedExisting = 0;
      let errors = 0;

      try {
        const { data: importId, error: beginError } = await supabase.rpc("begin_product_import", {
          p_filename: filename,
          p_total_rows: stats.totalRows,
          p_importable_count: products.length,
        });

        if (beginError) throw beginError;
        if (!importId) throw new Error("Falha ao iniciar importação");

        for (let offset = 0; offset < products.length; offset += IMPORT_BATCH_SIZE) {
          const batch = products.slice(offset, offset + IMPORT_BATCH_SIZE);
          const batchNumber = Math.floor(offset / IMPORT_BATCH_SIZE) + 1;
          const payload = batch.map(toRpcItem);

          const { data: batchResult, error: batchError } = await supabase.rpc("import_product_batch", {
            p_import_id: importId,
            p_batch_number: batchNumber,
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
            classified_on_insert: classifiedOnInsert,
            pending_category_review: pendingReview,
          },
        });

        if (finishError) throw finishError;

        return {
          importId,
          inserted,
          skippedExisting,
          errors,
          totalProcessed: products.length,
          classifiedOnInsert,
          pendingReview,
        };
      } finally {
        setIsImporting(false);
      }
    },
    [storeId, ensureCategories],
  );

  return {
    fetchExistingIdentifiers,
    importProducts,
    ensureCategories,
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
    category_id: product.category_id ?? null,
    classification_status: product.classification_status ?? null,
  };
}

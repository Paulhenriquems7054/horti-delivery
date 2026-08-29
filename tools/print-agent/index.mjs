/**
 * Agente local de impressão — HortiDelivery
 *
 * Poll da fila de impressão no Supabase e envio para impressora do sistema.
 * Compatível com impressoras matriciais/térmicas via spooler do Windows (ou CUPS no Linux).
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... STORE_SLUG=beira-rio PRINT_AGENT_TOKEN=... node index.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";
const storeSlug = process.env.STORE_SLUG ?? "beira-rio";
const agentToken = process.env.PRINT_AGENT_TOKEN ?? "";
const pollMs = Number(process.env.PRINT_POLL_MS ?? "5000");
const printerName = process.env.PRINT_PRINTER_NAME ?? "";
const isWindows = process.platform === "win32";

if (!supabaseUrl || !supabaseAnonKey || !agentToken) {
  console.error("Defina SUPABASE_URL, SUPABASE_ANON_KEY e PRINT_AGENT_TOKEN.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function printText(text) {
  const filePath = join(tmpdir(), `horti-print-${Date.now()}.txt`);
  await writeFile(filePath, text, "utf8");
  try {
    if (isWindows) {
      const args = printerName
        ? ["/D:", printerName, filePath]
        : [filePath];
      await execFileAsync("print", args, { windowsHide: true });
    } else {
      const args = printerName ? ["-d", printerName, filePath] : [filePath];
      await execFileAsync("lp", args);
    }
  } finally {
    await unlink(filePath).catch(() => {});
  }
}

async function processJobs() {
  const { data: jobs, error } = await supabase.rpc("claim_print_jobs", {
    p_store_slug: storeSlug,
    p_agent_token: agentToken,
    p_limit: 3,
  });

  if (error) {
    console.error("[print-agent] claim error:", error.message);
    return;
  }

  const jobList = Array.isArray(jobs) ? jobs : [];
  if (!jobList.length) return;

  for (const job of jobList) {
    const jobId = job.job_id ?? job.id;
    const text = job.payload?.receipt_text ?? "";
    if (!text) {
      await supabase.rpc("complete_print_job", {
        p_job_id: jobId,
        p_store_slug: storeSlug,
        p_agent_token: agentToken,
        p_success: false,
        p_error_message: "empty payload",
      });
      continue;
    }

    try {
      await printText(text);
      await supabase.rpc("complete_print_job", {
        p_job_id: jobId,
        p_store_slug: storeSlug,
        p_agent_token: agentToken,
        p_success: true,
      });
      console.log(`[print-agent] printed job ${jobId} order ${job.order_id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "print failed";
      await supabase.rpc("complete_print_job", {
        p_job_id: jobId,
        p_store_slug: storeSlug,
        p_agent_token: agentToken,
        p_success: false,
        p_error_message: message,
      });
      console.error(`[print-agent] failed job ${jobId}:`, message);
    }
  }
}

console.log(`[print-agent] listening store=${storeSlug} poll=${pollMs}ms`);
setInterval(() => {
  processJobs().catch((err) => console.error("[print-agent]", err));
}, pollMs);
processJobs().catch((err) => console.error("[print-agent]", err));

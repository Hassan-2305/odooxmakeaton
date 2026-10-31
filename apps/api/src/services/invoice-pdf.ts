import type { InvoiceDetail } from "@brightloop/shared";
import PDFDocument from "pdfkit";
import { addDays } from "../lib/dates.js";

/** 123456789 paise → "INR 12,34,567.89" (Indian digit grouping). */
export function formatInr(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100).toLocaleString("en-IN");
  return `${sign}INR ${rupees}.${String(abs % 100).padStart(2, "0")}`;
}

function bps(rate: number): string {
  return `${(rate / 100).toFixed(rate % 100 ? 2 : 0)}%`;
}

/** Renders the invoice as a PDF. Generated on request; nothing is stored. */
export function renderInvoicePdf(invoice: InvoiceDetail, businessName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Invoice ${invoice.number ?? "draft"}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const c = invoice.customerSnapshot as Record<string, string | null>;
    const status = invoice.status === "draft" ? "DRAFT " : "";

    doc.fontSize(20).text(businessName);
    doc.moveDown(0.5).fontSize(14).text(`${status}Tax Invoice ${invoice.number ?? ""}`.trim());
    doc.moveDown(0.5).fontSize(10);
    doc.text(`Issue date: ${invoice.issueDate ?? "-"}    Due date: ${invoice.dueDate ?? "-"}`);
    // period_end is exclusive; show the last day billed.
    doc.text(`Billing period: ${invoice.periodStart} to ${addDays(invoice.periodEnd, -1)}`);
    doc.text(`Status: ${invoice.status}`);

    doc.moveDown().fontSize(11).text("Bill to", { underline: true }).fontSize(10);
    doc.text(c.name ?? "");
    for (const line of [c.addressLine1, c.addressLine2, [c.city, c.state, c.postalCode].filter(Boolean).join(", ")]) {
      if (line) doc.text(line);
    }
    if (c.gstin) doc.text(`GSTIN: ${c.gstin}`);
    if (c.email) doc.text(c.email);

    doc.moveDown();
    const cols = { desc: 50, qty: 300, unit: 340, amount: 440 };
    const row = (desc: string, qty: string, unit: string, amount: string) => {
      const y = doc.y;
      doc.text(desc, cols.desc, y, { width: 240 });
      const end = doc.y;
      doc.text(qty, cols.qty, y, { width: 35, align: "right" });
      doc.text(unit, cols.unit, y, { width: 95, align: "right" });
      doc.text(amount, cols.amount, y, { width: 105, align: "right" });
      doc.y = Math.max(end, doc.y);
      doc.x = cols.desc;
    };
    doc.font("Helvetica-Bold");
    row("Description", "Qty", "Unit price", "Amount (net)");
    doc.font("Helvetica");
    for (const line of invoice.lines) {
      const sign = line.kind === "discount" ? -1 : 1;
      row(line.description, String(line.quantity), formatInr(line.unitPricePaise), formatInr(sign * line.amountPaise));
      for (const t of line.taxes) {
        row(`   ${t.name} @ ${bps(t.rateBps)}${t.inclusive ? " (incl.)" : ""} on ${formatInr(t.taxableAmountPaise)}`, "", "", formatInr(t.taxAmountPaise));
      }
    }

    doc.moveDown();
    const total = (label: string, paise: number) => row(label, "", "", formatInr(paise));
    total("Subtotal", invoice.subtotalPaise);
    if (invoice.discountTotalPaise) total("Discounts", -invoice.discountTotalPaise);
    total("Tax", invoice.taxTotalPaise);
    doc.font("Helvetica-Bold");
    total("Total", invoice.totalPaise);
    doc.font("Helvetica");
    if (invoice.amountPaidPaise) total("Paid", -invoice.amountPaidPaise);
    if (invoice.creditedPaise) total("Credited", -invoice.creditedPaise);
    doc.font("Helvetica-Bold");
    total("Balance due", invoice.balancePaise);

    doc.end();
  });
}

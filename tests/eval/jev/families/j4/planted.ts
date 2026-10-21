/**
 * J4 planted defects. Each is a deliberately wrong implementation run
 * through the SAME property check and inputs as the product. The control is
 * caught (FAIL) when at least one input disagrees with the oracle; a control
 * that stays PASS means the oracle cannot see that class of defect.
 */
import { calculateInvoiceTotals } from "@/lib/invoices/calc";

export const PLANTED_J4: Array<{ id: string; fn: string; why: string; wrong: unknown }> = [
  {
    id: "J4-CTRL-gst15",
    fn: "computeGstCents.AU",
    why: "Australian GST charged at the NZ 15% rate",
    wrong: (s: number) => Math.round(s * 0.15),
  },
  {
    id: "J4-CTRL-gst-float",
    fn: "computeGstCents.AU",
    why: "GST truncated instead of rounded half up",
    wrong: (s: number) => Math.floor(s / 10),
  },
  {
    id: "J4-CTRL-area-factor",
    fn: "roomAreaM2.rect",
    why: "room area scaled by 1.1 (wrong px/m)",
    wrong: (pts: Array<{ x: number; y: number }>, ppm: number) => {
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const k = (i + 1) % pts.length;
        a += pts[i].x * pts[k].y - pts[k].x * pts[i].y;
      }
      return (Math.abs(a) / 2 / (ppm * ppm)) * 1.1;
    },
  },
  {
    id: "J4-CTRL-abn-true",
    fn: "isValidAbn",
    why: "ABN check that accepts everything",
    wrong: () => true,
  },
  {
    id: "J4-CTRL-airmovers-nonmonotone",
    fn: "calculateAirMoversRequired",
    why: "air movers that drop once area passes 100 m2",
    wrong: (a: number, cls: 1 | 2 | 3 | 4) => {
      const per = { 1: 20, 2: 15, 3: 10, 4: 8 }[cls];
      return a > 100 ? 1 : Math.ceil(a / per);
    },
  },
  {
    id: "J4-CTRL-invoice-offbyone",
    fn: "calculateInvoiceTotals.plain",
    why: "invoice total one cent above subtotal + GST",
    wrong: (input: Parameters<typeof calculateInvoiceTotals>[0]) => {
      const r = calculateInvoiceTotals(input);
      return { ...r, totalIncGST: r.totalIncGST + 1 };
    },
  },
  {
    id: "J4-CTRL-currency-nocomma",
    fn: "formatCurrencyCents",
    why: "currency without thousands separators",
    wrong: (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toFixed(2)}`,
  },
];

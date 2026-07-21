import { z } from 'zod';

export const InvoiceExtractionSchema = z.object({
  invoiceNumber: z.string().min(1),
  vendor: z.string().min(1),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  recipientWallet: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.string()),
});

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;

export const RiskResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  decision: z.enum(['AUTO_PROPOSE', 'ESCALATE', 'BLOCK']),
  flags: z.array(z.object({
    code: z.string(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    message: z.string(),
    evidence: z.string(),
  })),
});

export type RiskResult = z.infer<typeof RiskResultSchema>;

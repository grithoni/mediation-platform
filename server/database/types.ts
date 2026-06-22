// ============================================================
// Database type helpers — proper types for insert/select operations
// Eliminates the need for `as any` casts on Drizzle operations
// ============================================================
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import type * as schema from './schema'

// Select types (what comes back from the DB)
export type Tenant = InferSelectModel<typeof schema.tenants>
export type User = InferSelectModel<typeof schema.users>
export type Case = InferSelectModel<typeof schema.cases>
export type Mediator = InferSelectModel<typeof schema.mediators>
export type Message = InferSelectModel<typeof schema.messages>
export type Document = InferSelectModel<typeof schema.documents>
export type Session = InferSelectModel<typeof schema.sessions>
export type CaseDynamicFile = InferSelectModel<typeof schema.caseDynamicFiles>
export type McpTool = InferSelectModel<typeof schema.mcpTools>
export type SavedConversation = InferSelectModel<typeof schema.savedConversations>
export type Agreement = InferSelectModel<typeof schema.agreements>
export type AgreementSignature = InferSelectModel<typeof schema.agreementSignatures>
export type CaseActivity = InferSelectModel<typeof schema.caseActivities>
export type CaseNote = InferSelectModel<typeof schema.caseNotes>
export type SettlementProposal = InferSelectModel<typeof schema.settlementProposals>
export type Webhook = InferSelectModel<typeof schema.webhooks>
export type WebhookLog = InferSelectModel<typeof schema.webhookLogs>

// Insert types (what you pass to db.insert())
// These properly handle $defaultFn fields being optional
export type TenantInsert = InferInsertModel<typeof schema.tenants>
export type UserInsert = InferInsertModel<typeof schema.users>
export type CaseInsert = InferInsertModel<typeof schema.cases>
export type MediatorInsert = InferInsertModel<typeof schema.mediators>
export type MessageInsert = InferInsertModel<typeof schema.messages>
export type DocumentInsert = InferInsertModel<typeof schema.documents>
export type SessionInsert = InferInsertModel<typeof schema.sessions>
export type CaseDynamicFileInsert = InferInsertModel<typeof schema.caseDynamicFiles>
export type McpToolInsert = InferInsertModel<typeof schema.mcpTools>
export type SavedConversationInsert = InferInsertModel<typeof schema.savedConversations>
export type AgreementInsert = InferInsertModel<typeof schema.agreements>
export type AgreementSignatureInsert = InferInsertModel<typeof schema.agreementSignatures>
export type CaseActivityInsert = InferInsertModel<typeof schema.caseActivities>
export type CaseNoteInsert = InferInsertModel<typeof schema.caseNotes>
export type SettlementProposalInsert = InferInsertModel<typeof schema.settlementProposals>
export type WebhookInsert = InferInsertModel<typeof schema.webhooks>
export type WebhookLogInsert = InferInsertModel<typeof schema.webhookLogs>

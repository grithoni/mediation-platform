export function phaseAfterAgreementApproval(_allPartiesApproved: boolean): string {
  return 'agreement_pending'
}

export function phaseAfterSigningStarted(): string {
  return 'signing'
}

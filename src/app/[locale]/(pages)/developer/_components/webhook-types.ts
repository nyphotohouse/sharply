export type WebhookTarget = {
  id: string;
  eventType: string;
  endpointUrl: string;
  isEnabled: boolean;
  createdAt: Date | string;
};

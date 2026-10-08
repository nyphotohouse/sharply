export class DeveloperApiError extends Error {
  constructor(
    public readonly code:
      | "missing_api_key"
      | "invalid_api_key"
      | "invalid_request"
      | "not_found"
      | "rate_limit_exceeded"
      | "developer_access_required"
      | "key_limit_reached"
      | "target_limit_reached"
      | "forbidden",
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DeveloperApiError";
  }
}

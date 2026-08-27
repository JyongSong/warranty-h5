export class InstallationCustomerRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallationCustomerRequestError";
  }
}

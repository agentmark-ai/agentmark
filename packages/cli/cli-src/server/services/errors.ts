/**
 * Error thrown when a method is called on the local implementation that
 * isn't available on the local dev server.
 */
export class NotAvailableLocallyError extends Error {
  readonly name = 'NotAvailableLocallyError' as const;
  readonly method: string;
  readonly requiredCapability: string;

  constructor(method: string, requiredCapability: string) {
    super(
      `${method}() is not available on the local dev server. ` +
      `This feature requires ${requiredCapability}.`
    );
    this.method = method;
    this.requiredCapability = requiredCapability;
  }
}

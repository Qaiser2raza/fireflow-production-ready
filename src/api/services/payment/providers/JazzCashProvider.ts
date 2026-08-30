import crypto from 'crypto';
import { PaymentProvider, PaymentRequest, PaymentResult, PaymentStatusRequest, PaymentStatusResult, RefundRequest, RefundResult } from '../PaymentTypes';

export class JazzCashProvider implements PaymentProvider {
  readonly type = 'JAZZCASH';
  readonly version = '1.0.0';
  readonly capabilities: readonly string[] = ['JAZZCASH'];

  private readonly merchantId: string;
  private readonly password: string;
  private readonly integritySalt: string;
  private readonly apiBaseUrl: string;

  constructor() {
    this.merchantId = String(process.env.JAZZCASH_MERCHANT_ID || '').trim();
    this.password = String(process.env.JAZZCASH_PASSWORD || '').trim();
    this.integritySalt = String(process.env.JAZZCASH_INTEGRITY_SALT || '').trim();
    const sandbox = process.env.JAZZCASH_SANDBOX !== 'false';
    this.apiBaseUrl = String(process.env.JAZZCASH_API_BASE_URL || '').trim() ||
      (sandbox
        ? 'https://sandbox.jazzcash.com.pk/ApplicationAPI/API'
        : 'https://payments.jazzcash.com.pk/ApplicationAPI/API');

    if (!this.merchantId || !this.password || !this.integritySalt) {
      throw new Error('JazzCash provider requires JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, and JAZZCASH_INTEGRITY_SALT');
    }
  }

  buildTransactionReference(paymentId: string): string {
    return `JZ-${paymentId}`;
  }

  async send(request: PaymentRequest): Promise<PaymentResult> {
    const customerMobile = request.context.customerMobile;
    if (!customerMobile) {
      return {
        outcome: 'FAILED',
        errorCode: 'JAZZCASH_CUSTOMER_MOBILE_REQUIRED',
        errorMessage: 'Customer mobile number is required for JazzCash payment',
      };
    }

    const txnRefNo = this.buildTransactionReference(request.paymentId);
    const now = new Date();
    const txnDateTime = this.formatDateTime(now);
    const txnExpiryDateTime = this.formatDateTime(new Date(now.getTime() + 60 * 60 * 1000));

    const payload: Record<string, any> = {
      pp_Language: 'EN',
      pp_MerchantID: this.merchantId,
      pp_Password: this.password,
      pp_TxnRefNo: txnRefNo,
      pp_MobileNumber: String(customerMobile),
      pp_Amount: this.toPaisa(request.amount),
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: txnDateTime,
      pp_TxnExpiryDateTime: txnExpiryDateTime,
      pp_BillReference: request.orderId,
      pp_Description: `Order ${request.orderId} payment`,
      pp_SecureHash: '',
      pp_Version: '2.0',
      pp_TxnType: 'MWALLET',
    };

    payload.pp_SecureHash = this.computeSecureHash(payload);

    const url = `${this.apiBaseUrl}/2.0/Purchase/DoMWalletTransaction`;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (e: any) {
      return {
        outcome: 'UNKNOWN',
        errorCode: 'JAZZCASH_NETWORK_ERROR',
        errorMessage: `JazzCash request failed: ${e.message}`,
      };
    }

    const text = await response.text();
    let data: Record<string, any>;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        outcome: 'UNKNOWN',
        errorCode: 'JAZZCASH_INVALID_RESPONSE',
        errorMessage: `JazzCash returned non-JSON response: ${text.slice(0, 200)}`,
      };
    }

    if (!this.verifyResponseHash(data)) {
      return {
        outcome: 'UNKNOWN',
        errorCode: 'JAZZCASH_HASH_MISMATCH',
        errorMessage: 'JazzCash response secureHash verification failed',
      };
    }

    const responseCode = String(data.pp_ResponseCode || data.responseCode || '').trim();
    if (responseCode === '000') {
      return {
        outcome: 'PAID',
        externalReference: data.pp_RetreivalReferenceNo || data.rrn || txnRefNo,
        providerStatus: data.status,
      };
    }

    if (responseCode === '112' || responseCode === '113' || responseCode === '114') {
      return {
        outcome: 'FAILED',
        errorCode: `JAZZCASH_${responseCode}`,
        errorMessage: data.pp_ResponseMessage || data.responseMessage || 'JazzCash declined the transaction',
      };
    }

    return {
      outcome: 'FAILED',
      errorCode: `JAZZCASH_${responseCode || 'UNKNOWN'}`,
      errorMessage: data.pp_ResponseMessage || data.responseMessage || 'JazzCash transaction failed',
    };
  }

  async retrieveStatus(request: PaymentStatusRequest): Promise<PaymentStatusResult> {
    const payload: Record<string, any> = {
      pp_MerchantID: this.merchantId,
      pp_Password: this.password,
      pp_TxnRefNo: request.providerReference,
      pp_Version: '2.0',
      pp_SecureHash: '',
    };

    payload.pp_SecureHash = this.computeSecureHash(payload);

    const url = `${this.apiBaseUrl}/2.0/PaymentInquiry/Inquire`;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (e: any) {
      return {
        outcome: 'UNKNOWN',
        errorCode: 'JAZZCASH_NETWORK_ERROR',
        errorMessage: `JazzCash inquiry failed: ${e.message}`,
      };
    }

    const text = await response.text();
    let data: Record<string, any>;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        outcome: 'UNKNOWN',
        errorCode: 'JAZZCASH_INVALID_RESPONSE',
        errorMessage: `JazzCash inquiry returned non-JSON response: ${text.slice(0, 200)}`,
      };
    }

    if (!this.verifyResponseHash(data)) {
      return {
        outcome: 'UNKNOWN',
        errorCode: 'JAZZCASH_HASH_MISMATCH',
        errorMessage: 'JazzCash inquiry response secureHash verification failed',
      };
    }

    const responseCode = String(data.pp_ResponseCode || data.responseCode || '').trim();
    if (responseCode === '000') {
      const status = String(data.status || '').toUpperCase();
      if (status === 'SUCCESS' || status === 'PAID') {
        return {
          outcome: 'PAID',
          providerStatus: data.status,
        };
      }
      if (status === 'FAILED' || status === 'DECLINED' || status === 'CANCELLED') {
        return {
          outcome: 'FAILED',
          errorCode: `JAZZCASH_${status}`,
          errorMessage: data.pp_ResponseMessage || data.responseMessage || 'JazzCash inquiry returned failure',
        };
      }
      return {
        outcome: 'UNKNOWN',
        errorCode: 'JAZZCASH_STATUS_UNKNOWN',
        errorMessage: `JazzCash inquiry returned unrecognized status: ${status}`,
      };
    }

    return {
      outcome: 'UNKNOWN',
      errorCode: `JAZZCASH_INQUIRY_${responseCode || 'UNKNOWN'}`,
      errorMessage: data.pp_ResponseMessage || data.responseMessage || 'JazzCash inquiry failed',
    };
  }

  async refund(_request: RefundRequest): Promise<RefundResult> {
    return {
      outcome: 'UNKNOWN',
      errorCode: 'JAZZCASH_REFUND_NOT_IMPLEMENTED',
      errorMessage: 'JazzCash refund requires verified endpoint contract and is deferred from Phase A',
    };
  }

  private computeSecureHash(data: Record<string, any>): string {
    const entries = Object.entries(data)
      .filter(([key, value]) => key !== 'pp_SecureHash' && value !== '' && value != null)
      .sort((a, b) => a[0].localeCompare(b[0]));

    const hashString = entries.map(([, value]) => String(value)).join('&').replace(/^/, '&');
    const signed = `${this.integritySalt}${hashString}`;

    return crypto.createHmac('sha256', this.integritySalt).update(signed, 'utf8').digest('hex').toUpperCase();
  }

  private verifyResponseHash(data: Record<string, any>): boolean {
    const expected = String(data.secureHash || data.pp_SecureHash || '').trim();
    if (!expected) return true;

    const computed = this.computeSecureHash(data);
    return computed === expected;
  }

  private toPaisa(amount: number): string {
    return String(Math.round(Number(amount) * 100));
  }

  private formatDateTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }
}

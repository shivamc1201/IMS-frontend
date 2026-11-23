import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PaymentSubmissionPayload } from '../../services/accountsLedger.service';

export interface PaymentRequest {
  distributorId: string;
  amount: number;
  method: string;
  reference: string;
  balanceType?: 'credit' | 'debit';
  date?: string;
  description?: string;
  paymentMethod?: string;
  utrNumber?: string;
  bankName?: string;
  chequeNumber?: string;
  transactionNumber?: string;
  notes?: string;
}

export interface PaymentResponse {
  message: string;
  paymentId?: number;
  status?: string;
  success?: boolean;
  data?: any;
}

export interface PendingPayment {
  id: number;
  distributorId: number;
  distributorName: string;
  amount: number;
  createdAt: string;
  description: string;
  status: string;
  transactionType: string;
  salespersonId: number;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private readonly apiUrl: string;
  private readonly submitUrl: string;
  private readonly ledgerPaymentsUrl: string;
  private readonly pendingPaymentsUrl: string;

  constructor(private readonly http: HttpClient) {
    this.apiUrl = `${environment.apiUrl}/accounts/update-balance-with-salesperson`;
    this.submitUrl = `${environment.apiUrl}/accounts/update-balance`;
    this.ledgerPaymentsUrl = `${environment.apiUrl}/accounts/ledger-updated-payments`;
    this.pendingPaymentsUrl = `${environment.apiUrl}/accounts/pending-payments`;
  }

  /**
   * POST /api/accounts/update-balance with a JSON body (PaymentSubmissionRequest).
   * The backend rejects query-param / empty-body submissions with 400.
   */
  submitPayment(paymentData: PaymentRequest, salespersonId: number): Observable<PaymentResponse> {
    const mode = (paymentData.paymentMethod || '').toUpperCase() as PaymentSubmissionPayload['paymentMode'];

    const payload: PaymentSubmissionPayload = {
      distributorId: parseInt(paymentData.distributorId, 10),
      salespersonId,
      amount: paymentData.amount,
      transactionType: paymentData.balanceType === 'credit' ? 'CREDIT' : 'DEBIT',
      description: (paymentData.description || 'Payment').trim(),
      date: paymentData.date || '',
      paymentMode: mode,
      ...(mode === 'RTGS' || mode === 'NEFT' ? { utrNumber: (paymentData.utrNumber || '').trim() } : {}),
      ...(mode === 'CHEQUE'
        ? { chequeNumber: (paymentData.chequeNumber || '').trim(), bankName: (paymentData.bankName || '').trim() }
        : {}),
      ...(mode === 'IMPS' || mode === 'UPI' ? { transactionNumber: (paymentData.transactionNumber || '').trim() } : {}),
    };

    return this.http.post<PaymentResponse>(this.submitUrl, payload);
  }

  getPaymentStatus(paymentId: string): Observable<PaymentResponse> {
    return this.http.get<PaymentResponse>(`${this.apiUrl}/${paymentId}`);
  }

  getPaymentHistory(distributorId: string): Observable<PaymentResponse> {
    return this.http.get<PaymentResponse>(`${this.apiUrl}/distributor/${distributorId}`);
  }

  getLedgerUpdatedPaymentsBySalesperson(salespersonId: number): Observable<any> {
    const params = { salespersonId: salespersonId.toString() };
    return this.http.get<any>(this.ledgerPaymentsUrl, { params });
  }

  getPendingPayments(salespersonId: number): Observable<any> {
    const params = {
      salespersonId: salespersonId.toString()
    };
    return this.http.get<any>(this.pendingPaymentsUrl, { params });
  }
}

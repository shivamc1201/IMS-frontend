import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface LedgerDto {
    id: number;
    accountName: string;
    accountNumber: string;
    accountType: string;
    active: boolean;
    companyId: number;
    createdAt: string;
    createdBy: string;
    creditLimit: number;
    currentBalance: number;
    distributorId: number;
    salespersonId: number | null;
    status: string;
    updatedAt: string;
    updatedBy: string | null;
    version: number;
}

/** Body of POST /api/accounts/update-balance (backend: PaymentSubmissionRequest). */
export interface PaymentSubmissionPayload {
    distributorId: number;
    salespersonId?: number | null;      // omit when the distributor adds their own payment
    amount: number;
    transactionType: 'CREDIT' | 'DEBIT';
    description: string;
    date: string;                        // yyyy-MM-dd'T'HH:mm:ss
    paymentMode: 'RTGS' | 'NEFT' | 'IMPS' | 'UPI' | 'CHEQUE' | 'CASH';
    utrNumber?: string;                  // RTGS / NEFT
    chequeNumber?: string;               // CHEQUE
    bankName?: string;                   // CHEQUE
    transactionNumber?: string;          // IMPS / UPI
}

export interface ApiResponse<T> {
    success: boolean;
    message: string;
    data: T;
}

export interface Distributor {
    id: number;
    name: string;
    firmName?: string;
    lastName?: string;
    accountName: string;
    accountNumber: string;
    email: string;
    phoneNumber: string;
    address: string;
    gstNumber: string;
    panNumber: string;
    aadhaarNumber: string;
    companyType: string;
    distributorType: string;
    status: string;
    username: string;
    assignedPerson: string;
    contactEmail: string;
    alternateContact: string;
    IFSC: string;
    createdOn: string;
    updatedOn: string;
    creditLimit?: number;
    creditBalance?: number;
    bankGuaranteeNumber?: string;
    bgExpiryDate?: string;
    district?: string;
    state?: string;
    pinCode?: string;
}

@Injectable({
    providedIn: 'root'
})
export class LedgerService {
    private readonly baseUrl = environment.ledgerUrl;
    private readonly apiUrl = environment.apiUrl;

    constructor(private http: HttpClient) { }

    getAllLedgers(): Observable<ApiResponse<LedgerDto[]>> {
        return this.http.get<ApiResponse<LedgerDto[]>>(
            `${this.baseUrl}/all-account`);
    }

    getDistributors(): Observable<ApiResponse<Distributor[]>> {
        return this.http.get<ApiResponse<Distributor[]>>(
            `${this.apiUrl}/distributors`).pipe(
            catchError(error => {
                console.error('Get Distributors Error:', error);
                return of({
                    success: false,
                    message: 'Failed to fetch distributors',
                    data: []
                });
            })
        );
    }

    /** Puts the server's message in error.message, also for routes read as plain text. */
    private readableError(error: any, fallback: string) {
        let body = error?.error;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch { body = { message: body }; }
        }
        const message = body?.message || body?.error || fallback;
        return { status: error?.status, message, error: { message } };
    }

    updateBalance(
        distributorId: number,
        amount: number,
        description: string,
        transactionType?: string,
        date?: string
    ): Observable<ApiResponse<any>> {
        let url = `${this.apiUrl}/accounts/update-balance-accounts?distributorId=${distributorId}&amount=${amount}&description=${encodeURIComponent(description)}`;
        if (transactionType) {
            url += `&transactionType=${transactionType}`;
        }
        if (date) {
            url += `&date=${encodeURIComponent(date)}`;
        }
        // Failures must reach the caller: never report an unsaved ledger entry as saved.
        return this.http.post<ApiResponse<any>>(url, {}).pipe(
            catchError(error => throwError(() => this.readableError(error, 'Failed to update balance')))
        );
    }

    /**
     * POST /api/accounts/update-balance — submits a payment for approval.
     * The backend expects a JSON body (PaymentSubmissionRequest), not query params.
     * Errors are NOT swallowed: callers must handle them so a failed save is never shown as success.
     */
    updateBalanceDirect(payload: PaymentSubmissionPayload): Observable<{ paymentId?: number; message?: string; status?: string }> {
        return this.http.post<{ paymentId?: number; message?: string; status?: string }>(
            `${this.apiUrl}/accounts/update-balance`,
            payload
        );
    }

    getPaymentHistory(distributorId: number): Observable<ApiResponse<any>> {
        return this.http.get<any>(`${this.apiUrl}/accounts/payment-history/${distributorId}`).pipe(
            map((response: any) => {
                // API returns { closingBalance, distributorId, paymentHistory[] }
                return {
                    success: true,
                    message: 'Payment history retrieved successfully',
                    data: response
                };
            }),
            catchError(error => {
                console.error('Payment History Error:', error);
                return of({
                    success: false,
                    message: 'Failed to fetch payment history',
                    data: []
                });
            })
        );
    }

    approvePI(accountId: number, distributorId: number, salespersonId: number): Observable<ApiResponse<any>> {
        return this.http.post<ApiResponse<any>>(
            `${this.apiUrl}/accounts/approve-PI/${accountId}?distributorId=${distributorId}&salespersonId=${salespersonId}`,
            {}
        ).pipe(
            catchError(error => {
                console.error('Approve PI Error:', error);
                return of({
                    success: true,
                    message: error.statusText || 'PI approved successfully',
                    data: null
                });
            })
        );
    }

    approvePIUsingCredit(cartId: number, distributorId: number): Observable<ApiResponse<any>> {
        return this.http.post<ApiResponse<any>>(
            `${this.apiUrl}/accounts/approve-PI-using-credit/${cartId}?distributorId=${distributorId}`,
            {}
        );
    }

    getCreditBalance(distributorId: number): Observable<{ creditBalance: number }> {
        return this.http.get<{ creditBalance: number }>(`${this.apiUrl}/accounts/credit-balance/${distributorId}`);
    }

    createJournalVoucher(payload: any, distributorId: number): Observable<ApiResponse<any>> {
        console.log('🔄 API Request - POST /api/accounts/journal-voucher');
        console.log('📤 Request Payload:', payload);
        console.log('📤 DistributorId:', distributorId);
        console.log('🌐 Full URL:', `${this.apiUrl}/accounts/journal-voucher?distributorId=${distributorId}`);
        
        return this.http.post(`${this.apiUrl}/accounts/journal-voucher?distributorId=${distributorId}`, payload, { 
            responseType: 'text' 
        }).pipe(
            map((response: any) => {
                console.log('✅ API Response (Status 200):', response);
                return {
                    success: true,
                    message: response || 'Journal Voucher created successfully',
                    data: null
                };
            }),
            catchError(error => throwError(() => this.readableError(error, 'Failed to create journal voucher')))
        );
    }

    getJournalVouchersByDistributor(distributorId: number): Observable<any[]> {
        console.log('🔄 API Request - GET /api/accounts/jv-by-distributor');
        console.log('📤 DistributorId:', distributorId);
        console.log('🌐 Full URL:', `${this.apiUrl}/accounts/jv-by-distributor/${distributorId}`);
        
        return this.http.get<any[]>(
            `${this.apiUrl}/accounts/jv-by-distributor/${distributorId}`
        ).pipe(
            catchError(error => {
                console.error('❌ API Error Response:', error);
                return of([]);
            })
        );
    }

    getLedgerUpdatedPaymentsByDistributor(distributorId: number): Observable<any[]> {
        return this.http.get<any[]>(
            `${this.apiUrl}/accounts/ledger-updated-payments`,
            { params: { distributorId: String(distributorId) } }
        ).pipe(
            catchError(error => {
                console.error('❌ API Error Response:', error);
                return of([]);
            })
        );
    }

    getPaymentsByDistributorAndStatus(distributorId: number, status: string): Observable<any[]> {
        console.log('🔄 API Request - GET /api/accounts/payments');
        console.log('📤 DistributorId:', distributorId);
        console.log('📤 Status:', status);
        console.log('🌐 Full URL:', `${this.apiUrl}/accounts/payments/${distributorId}?status=${status}`);
        
        return this.http.get<any[]>(
            `${this.apiUrl}/accounts/payments/${distributorId}?status=${status}`
        ).pipe(
            catchError(error => {
                console.error('❌ API Error Response:', error);
                return of([]);
            })
        );
    }

    getPendingPayments(distributorId: number): Observable<any[]> {
        console.log('🔄 API Request - GET /api/accounts/pending-payments');
        console.log('📤 DistributorId:', distributorId);
        console.log('🌐 Full URL:', `${this.apiUrl}/accounts/pending-payments?distributorId=${distributorId}`);
        
        return this.http.get<any[]>(
            `${this.apiUrl}/accounts/pending-payments?distributorId=${distributorId}`
        ).pipe(
            catchError(error => {
                console.error('❌ API Error Response:', error);
                return of([]);
            })
        );
    }

    /**
     * Fetch ALL payment requests across every distributor, with optional status filter.
     * Used by the centralised Payment Requests page.
     */
    getAllPaymentRequests(status?: string, page: number = 0, size: number = 50): Observable<any> {
        let url = `${this.apiUrl}/accounts/payment-requests?page=${page}&size=${size}`;
        if (status && status !== 'ALL') {
            url += `&status=${status}`;
        }
        console.log('🔄 API Request - GET /api/accounts/payment-requests', { status, page, size });
        return this.http.get<any>(url).pipe(
            catchError(error => {
                console.error('❌ Error fetching all payment requests:', error);
                return of({ content: [], totalElements: 0, totalPages: 0 });
            })
        );
    }

    rejectPayment(paymentId: number, rejectedBy: number, reason: string): Observable<any> {
        console.log('🔄 API Request - POST /api/accounts/payment-rejection/' + paymentId);
        return this.http.post(
            `${this.apiUrl}/accounts/payment-rejection/${paymentId}?rejectedBy=${rejectedBy}`,
            { reason },
            { responseType: 'text' }
        ).pipe(
            map((response: any) => ({
                success: true,
                message: response || 'Payment rejected successfully',
            })),
            catchError(error => {
                console.error('❌ Error rejecting payment:', error);
                return of({ success: false, message: error?.error?.message || 'Failed to reject payment' });
            })
        );
    }

    approvePayment(paymentId: number, approvedBy: number): Observable<any> {
        console.log('🔄 API Request - POST /api/accounts/payment-approval/' + paymentId);
        console.log('📤 PaymentId:', paymentId);
        console.log('📤 ApprovedBy:', approvedBy);
        console.log('🌐 Full URL:', `${this.apiUrl}/accounts/payment-approval/${paymentId}?approvedBy=${approvedBy}`);
        
        return this.http.post(`${this.apiUrl}/accounts/payment-approval/${paymentId}?approvedBy=${approvedBy}`, '', { 
            responseType: 'text' 
        }).pipe(
            map((response: any) => {
                console.log('✅ API Response (Status 200):', response);
                return {
                    success: true,
                    message: response || 'Payment approved successfully',
                    data: null
                };
            }),
            catchError(error => throwError(() => this.readableError(error, 'Failed to approve payment')))
        );
    }

    //   createLedger(
    //     payload: any
    //   ): Observable<ApiResponse<LedgerDto>> {
    //     return this.http.post<ApiResponse<LedgerDto>>(
    //       `${this.baseUrl}/create-ledger`,
    //       payload
    //     );
    //   }

    //   updateLedger(
    //     id: number,
    //     payload: any
    //   ): Observable<ApiResponse<LedgerDto>> {
    //     return this.http.put<ApiResponse<LedgerDto>>(
    //       `${this.baseUrl}/${id}`,
    //       payload
    //     );
    //   }

    //   getLedgerById(id: number): Observable<ApiResponse<LedgerDto>> {
    //     return this.http.get<ApiResponse<LedgerDto>>(
    //       `${this.baseUrl}/${id}`
    //     );
    //   }

    //   deleteLedger(id: number): Observable<ApiResponse<string>> {
    //     return this.http.delete<ApiResponse<string>>(
    //       `${this.baseUrl}/${id}`
    //     );
    //   }

    updateCreditLimit(distributorId: number, newCreditAmount: number): Observable<ApiResponse<any>> {
        return this.http.put<ApiResponse<any>>(
            `${this.apiUrl}/distributors/${distributorId}`,
            { creditAmount: newCreditAmount, creditLimit: true }
        ).pipe(
            catchError(error => {
                console.error('Update Credit Limit Error:', error);
                return of({
                    success: false,
                    message: error?.error?.message || 'Failed to update credit limit',
                    data: null
                });
            })
        );
    }

    addCredit(distributorId: number, amount: number, description: string = 'Credit added by accounts team'): Observable<any> {
        const url = `${this.apiUrl}/accounts/add-credit/${distributorId}?amount=${amount}&description=${encodeURIComponent(description)}`;
        return this.http.post<any>(url, {}).pipe(
            catchError(error => {
                console.error('Add Credit Error:', error);
                return of({
                    paymentId: null,
                    message: error?.error?.message || 'Failed to add credit',
                    status: 'error'
                });
            })
        );
    }

    downloadDealerLedgerPdf(dealerId: number): Observable<Blob> {
        return this.http.post(
            `${this.apiUrl}/dealer-ledger/download-pdf?dealerId=${dealerId}`,
            {},
            { responseType: 'blob' }
        ).pipe(
            catchError(error => {
                console.error('Download Dealer Ledger PDF Error:', error);
                return of(new Blob());
            })
        );
    }
}
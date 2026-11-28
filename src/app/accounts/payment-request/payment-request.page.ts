import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { AccountsService } from '../../services/accounts.service';
import { Auth } from '../../services/auth';
import { HapticService } from '../../services/haptic.service';
import { Toast } from '../../services/toast';
import { AclDirective } from '../../acl/acl.directive';
import { DownloadService } from '../../services/download.service';
import { exportRowsToExcel } from '../../reports/report-shared';
import { addIcons } from 'ionicons';
import {
  walletOutline,
  refreshOutline,
  searchOutline,
  filterOutline,
  closeOutline,
  checkmarkCircleOutline,
  checkmarkCircle,
  closeCircleOutline,
  timeOutline,
  cashOutline,
  cardOutline,
  businessOutline,
  calendarOutline,
  documentTextOutline,
  informationCircleOutline,
  arrowForwardOutline,
  arrowBackOutline,
  chevronDownOutline,
  chevronUpOutline,
  funnelOutline,
  receiptOutline,
  trendingUpOutline,
  alertCircleOutline,
  ellipsisVerticalOutline,
  eyeOutline,
  swapVerticalOutline,
  phonePortraitOutline,
  banOutline,
  shieldCheckmarkOutline,
  chatboxEllipsesOutline,
  sparklesOutline,
  downloadOutline,
} from 'ionicons/icons';

export interface PaymentRequest {
  id: number;
  paymentRequestNo: string;
  distributorId: number;
  distributorName: string;
  distributorCode: string;
  orderId: number;
  orderNo: string;
  amount: number;
  transactionType: string;
  paymentMethod: 'RTGS' | 'NEFT' | 'IMPS' | 'UPI' | 'CHEQUE' | string;
  utrNumber?: string;
  chequeNumber?: string;
  bankName?: string;
  description?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  receiptUrl?: string;
}

/** One row of GET /api/accounts/payment-received-logs */
export interface PaymentLog {
  paymentId: number;
  distributorId: number;
  partyName: string;
  amount: number;
  transactionType: string;
  paymentMode: string;
  utrNumber?: string | null;
  chequeNumber?: string | null;
  bankName?: string | null;
  transactionNumber?: string | null;
  description?: string | null;
  status: string;
  addedByName?: string | null;
  createdAt: string;
  approvedAt?: string | null;
}

@Component({
  selector: 'app-payment-request',
  templateUrl: './payment-request.page.html',
  styleUrls: ['./payment-request.page.scss'],
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule, IonicModule, RouterModule, AclDirective],
})
export class PaymentRequestPage implements OnInit {

  /** Feature key used for CRUD button gating on this page. */
  readonly FEATURE = 'ACCOUNTS_PAYMENT_REQUESTS';

  // ── Data ──────────────────────────────────────────────────────────────────
  allPayments: PaymentRequest[] = [];
  filteredPayments: PaymentRequest[] = [];

  // ── UI State ──────────────────────────────────────────────────────────────
  isLoading = false;
  isDetailModalOpen = false;
  isApproveModalOpen = false;
  isRejectModalOpen = false;
  selectedPayment: PaymentRequest | null = null;
  rejectionReason = '';
  approvalNote = '';
  isSubmitting = false;
  rejectionChips = [
    'Duplicate payment',
    'Incorrect amount',
    'UTR / reference not found',
    'Payment not received in bank',
  ];

  // ── Filters ───────────────────────────────────────────────────────────────
  searchQuery = '';
  statusFilter: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' = 'ALL';
  methodFilter = 'ALL';
  activeTab: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'LOGS' = 'ALL';

  // ── Payment Logs (separate tab, loaded on demand) ────────────────────────
  allLogs: PaymentLog[] = [];
  filteredLogs: PaymentLog[] = [];
  isLogsLoading = false;
  logsLoaded = false;
  logsErrorMessage = '';
  logsPage = 1;

  // ── Pagination ────────────────────────────────────────────────────────────
  currentPage = 1;
  pageSize = 10;

  errorMessage = '';

  private haptic = inject(HapticService);
  private downloadService = inject(DownloadService);
  isExporting = false;

  constructor(
    private toast: Toast,
    private accountsService: AccountsService,
    private auth: Auth,
  ) {
    addIcons({
      walletOutline, refreshOutline, searchOutline, filterOutline, closeOutline,
      checkmarkCircleOutline, checkmarkCircle, closeCircleOutline, timeOutline,
      cashOutline, cardOutline, businessOutline, calendarOutline, documentTextOutline,
      informationCircleOutline, arrowForwardOutline, arrowBackOutline,
      chevronDownOutline, chevronUpOutline, funnelOutline, receiptOutline,
      trendingUpOutline, alertCircleOutline, ellipsisVerticalOutline, eyeOutline,
      swapVerticalOutline, phonePortraitOutline, banOutline,
      shieldCheckmarkOutline, chatboxEllipsesOutline, sparklesOutline, downloadOutline,
    });
  }

  ngOnInit() {
    this.loadPayments();
  }

  loadPayments() {
    this.isLoading = true;
    this.errorMessage = '';
    // Logs hold every payment with its status; they also feed the top summary cards.
    this.loadLogs();
    this.accountsService.getAllPendingPayments().subscribe({
      next: (data) => {
        this.allPayments = (Array.isArray(data) ? data : (data as any)?.data ?? []).map(
          (raw: any, i: number) => this.mapToPaymentRequest(raw, i)
        );
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load payment requests:', err);
        this.errorMessage = err?.error?.message || 'Failed to load payment requests. Please try again.';
        this.isLoading = false;
      },
    });
  }

  private normalizeStatus(raw: string): 'PENDING' | 'APPROVED' | 'REJECTED' {
    const s = (raw ?? '').toUpperCase().replace(/[\s-]/g, '_');
    if (['PAYMENT_ADDED', 'PENDING'].includes(s)) return 'PENDING';
    if (['PAYMENT_APPROVED', 'APPROVED'].includes(s)) return 'APPROVED';
    if (['PAYMENT_REJECTED', 'REJECTED'].includes(s)) return 'REJECTED';
    return 'PENDING';
  }

  private mapToPaymentRequest(raw: any, index: number): PaymentRequest {
    const id = raw.id ?? raw.paymentId ?? raw.requestId ?? (index + 1);
    return {
      id,
      paymentRequestNo: raw.paymentRequestNo ?? raw.referenceNo ?? raw.requestNo ?? `PR-${id}`,
      distributorId:    raw.distributorId ?? raw.distributor?.id ?? 0,
      distributorName:  raw.distributorName ?? raw.distributor?.name ?? raw.distributor?.fullName ?? 'Unknown',
      distributorCode:  raw.distributorCode ?? raw.distributor?.code ?? '',
      orderId:          raw.orderId ?? raw.cartId ?? raw.order?.id ?? 0,
      orderNo:          raw.orderNo ?? raw.orderNumber ?? (raw.orderId ? `ORD-${raw.orderId}` : (raw.cartId ? `CART-${raw.cartId}` : '')),
      amount:           raw.amount ?? raw.totalAmount ?? raw.paymentAmount ?? 0,
      transactionType:  raw.transactionType ?? 'CREDIT',
      paymentMethod:    (raw.paymentMethod ?? raw.method ?? 'OTHER').toUpperCase(),
      utrNumber:        raw.utrNumber ?? raw.utr ?? raw.transactionReference ?? raw.transactionId,
      chequeNumber:     raw.chequeNumber ?? raw.chequeNo,
      bankName:         raw.bankName ?? raw.bank,
      description:      raw.description ?? raw.remarks ?? raw.note,
      status:           this.normalizeStatus(raw.status ?? 'PENDING'),
      createdAt:        raw.createdAt ?? raw.submittedAt ?? raw.requestedAt ?? new Date().toISOString(),
      approvedAt:       raw.approvedAt,
      approvedBy:       raw.approvedBy,
      rejectedAt:       raw.rejectedAt,
      rejectedBy:       raw.rejectedBy,
      rejectionReason:  raw.rejectionReason ?? raw.rejectReason ?? raw.remarks,
      receiptUrl:       raw.receiptUrl ?? raw.receipt,
    };
  }

  // ── Payment Logs ──────────────────────────────────────────────────────────

  loadLogs() {
    this.isLogsLoading = true;
    this.logsErrorMessage = '';
    this.accountsService.getPaymentReceivedLogs().subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : (data as any)?.data ?? [];
        this.allLogs = list as PaymentLog[];
        this.logsLoaded = true;
        this.isLogsLoading = false;
        this.applyLogFilters();
      },
      error: (err) => {
        console.error('Failed to load payment logs:', err);
        this.logsErrorMessage = err?.error?.message || 'Failed to load payment logs. Please try again.';
        this.isLogsLoading = false;
      },
    });
  }

  applyLogFilters() {
    let result = [...this.allLogs];

    if (this.methodFilter !== 'ALL') {
      result = result.filter(l => (l.paymentMode || '').toUpperCase() === this.methodFilter);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(l =>
        (l.partyName || '').toLowerCase().includes(q) ||
        (l.utrNumber || '').toLowerCase().includes(q) ||
        (l.chequeNumber || '').toLowerCase().includes(q) ||
        (l.transactionNumber || '').toLowerCase().includes(q) ||
        (l.addedByName || '').toLowerCase().includes(q)
      );
    }
    this.filteredLogs = result;
    this.logsPage = 1;
  }

  /** Downloads every payment log with all its fields, ignoring the tab, search, method filter and page. */
  async exportLogsToExcel() {
    if (this.isExporting) return;
    this.haptic.medium();
    if (!this.logsLoaded || this.isLogsLoading || this.logsErrorMessage) {
      this.showToast('Payment logs are not loaded yet. Refresh and try again.', 'warning');
      return;
    }
    if (this.allLogs.length === 0) {
      this.showToast('There are no payment logs to export', 'warning');
      return;
    }

    const dateTime = (value?: string | null) => (value ? this.formatDateTime(value) : '');
    const rows = this.allLogs.map(log => ({
      'Payment ID': log.paymentId,
      'Distributor ID': log.distributorId,
      'Party': log.partyName || '',
      'Amount': Number(log.amount) || 0, // a number, so it can be totalled in Excel
      'Type': log.transactionType || '',
      'Mode': log.paymentMode || '',
      'UTR No.': log.utrNumber || '',
      'Cheque No.': log.chequeNumber || '',
      'Bank Name': log.bankName || '',
      'Transaction No.': log.transactionNumber || '',
      'Description': log.description || '',
      'Status': this.getLogStatusLabel(log.status),
      'Added By': log.addedByName || '',
      'Date': dateTime(log.createdAt),
      'Approved / Rejected At': dateTime(log.approvedAt),
    }));

    this.isExporting = true;
    try {
      await exportRowsToExcel(rows, 'Payment Logs', this.downloadService, this.toast, undefined,
        [12, 14, 28, 14, 10, 10, 20, 16, 20, 20, 36, 18, 28, 22, 22]);
    } catch (error) {
      console.error('Failed to export payment logs:', error);
      this.showToast('Failed to download the Excel file', 'danger');
    } finally {
      this.isExporting = false;
    }
  }

  /** Each log carries exactly one of UTR / cheque / transaction no. — show only what exists. */
  getLogReference(log: PaymentLog): { label: string; value: string } | null {
    if (log.utrNumber)         return { label: 'UTR No.',         value: log.utrNumber };
    if (log.chequeNumber)      return { label: 'Cheque No.',      value: log.chequeNumber };
    if (log.transactionNumber) return { label: 'Transaction No.', value: log.transactionNumber };
    return null;
  }

  /** Description is hidden when it just repeats the reference number. */
  getLogNote(log: PaymentLog): string {
    const ref = this.getLogReference(log)?.value;
    const desc = (log.description || '').trim();
    return desc && desc !== ref ? desc : '';
  }

  getLogStatusLabel(status: string): string {
    const s = (status || '').toUpperCase();
    const labels: Record<string, string> = {
      LEDGER_UPDATED: 'Ledger Updated',
      PAYMENT_ADDED: 'Payment Added',
      PENDING: 'Payment Added',
      PAYMENT_APPROVED: 'Payment Approved',
      APPROVED: 'Payment Approved',
      PAYMENT_REJECTED: 'Payment Rejected',
      REJECTED: 'Payment Rejected',
    };
    return labels[s] ?? (status || '-').replace(/_/g, ' ');
  }

  getLogStatusClass(status: string): string {
    const s = (status || '').toUpperCase();
    if (s.includes('REJECT')) return 'bg-red-50 text-red-600 border-red-200';
    if (s.includes('APPROV') || s === 'LEDGER_UPDATED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }

  get paginatedLogs(): PaymentLog[] {
    const start = (this.logsPage - 1) * this.pageSize;
    return this.filteredLogs.slice(start, start + this.pageSize);
  }

  get logsTotalPages(): number {
    return Math.ceil(this.filteredLogs.length / this.pageSize);
  }

  prevLogsPage() { if (this.logsPage > 1) this.logsPage--; }
  nextLogsPage() { if (this.logsPage < this.logsTotalPages) this.logsPage++; }

  handleRefresh() {
    this.loadPayments();
    this.showToast('Payment requests refreshed', 'success');
  }
  handlePullRefresh(event: any) {
    this.handleRefresh();
    setTimeout(() => event.target.complete(), 1500);
  }
  // ── Tabs & Filters ────────────────────────────────────────────────────────

  selectTab(tab: string) {
    this.haptic.selectionChanged();
    if (tab === 'LOGS') {
      this.activeTab = 'LOGS';
      if (!this.logsLoaded) {
        this.loadLogs();
      } else {
        this.applyLogFilters();
      }
      return;
    }
    this.activeTab = tab as 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
    this.statusFilter = this.activeTab;
    this.currentPage = 1;
    this.applyFilters();
  }

  applyFilters() {
    let result = [...this.allPayments];

    if (this.statusFilter !== 'ALL') {
      result = result.filter(p => p.status === this.statusFilter);
    }
    if (this.methodFilter !== 'ALL') {
      result = result.filter(p => p.paymentMethod === this.methodFilter);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(p =>
        p.distributorName.toLowerCase().includes(q) ||
        p.paymentRequestNo.toLowerCase().includes(q) ||
        p.orderNo.toLowerCase().includes(q) ||
        (p.utrNumber || '').toLowerCase().includes(q)
      );
    }
    this.filteredPayments = result;
    if (this.logsLoaded) this.applyLogFilters();
  }

  clearFilters() {
    this.searchQuery = '';
    this.methodFilter = 'ALL';
    this.currentPage = 1;
    this.applyFilters();
  }

  // ── Detail / Actions ──────────────────────────────────────────────────────

  openDetail(payment: PaymentRequest) {
    this.haptic.light();
    this.selectedPayment = payment;
    this.isDetailModalOpen = true;
  }

  openApproveModal(payment: PaymentRequest) {
    this.haptic.medium();
    this.selectedPayment = payment;
    this.approvalNote = '';
    this.isApproveModalOpen = true;
  }

  submitApproval() {
    this.haptic.heavy();
    if (!this.selectedPayment) return;
    const payment = this.selectedPayment;
    const userId = this.auth.getUserId() ?? 0;
    this.isSubmitting = true;

    this.accountsService.approvePayment(payment.id, userId).subscribe({
      next: () => {
        this.isApproveModalOpen = false;
        this.isDetailModalOpen = false;
        this.isSubmitting = false;
        this.approvalNote = '';
        this.selectedPayment = null;
        this.loadPayments();
        this.showToast(`${payment.paymentRequestNo} approved successfully`, 'success');
      },
      error: (err) => {
        // Backend sometimes returns a non-2xx even when the approval was committed.
        // Close modals immediately, then reload data to determine the actual result.
        this.isApproveModalOpen = false;
        this.isDetailModalOpen = false;
        this.isSubmitting = false;
        this.approvalNote = '';
        this.selectedPayment = null;
        this.isLoading = true;
        this.loadLogs();
        this.accountsService.getAllPendingPayments().subscribe({
          next: (data) => {
            this.allPayments = (Array.isArray(data) ? data : (data as any)?.data ?? []).map(
              (raw: any, i: number) => this.mapToPaymentRequest(raw, i)
            );
            this.applyFilters();
            this.isLoading = false;
            // If the payment is no longer PENDING it was successfully approved.
            const stillPending = this.allPayments.find(p => p.id === payment.id && p.status === 'PENDING');
            if (!stillPending) {
              this.showToast(`${payment.paymentRequestNo} approved successfully`, 'success');
            } else {
              this.showToast(err?.error?.message || 'Failed to approve payment. Please try again.', 'danger');
            }
          },
          error: () => {
            this.isLoading = false;
            this.showToast(err?.error?.message || 'Failed to approve payment. Please try again.', 'danger');
          },
        });
      },
    });
  }

  openRejectModal(payment: PaymentRequest) {
    this.haptic.medium();
    this.selectedPayment = payment;
    this.rejectionReason = '';
    this.isRejectModalOpen = true;
  }

  submitRejection() {
    this.haptic.heavy();
    if (!this.rejectionReason.trim()) {
      this.showToast('Please provide a rejection reason', 'warning');
      return;
    }
    if (!this.selectedPayment) return;

    const payment = this.selectedPayment;
    const userId = this.auth.getUserId() ?? 0;
    this.isSubmitting = true;

    this.accountsService.rejectPayment(payment.id, userId, this.rejectionReason.trim()).subscribe({
      next: (response) => {
        this.loadPayments();
        this.isRejectModalOpen = false;
        this.isDetailModalOpen = false;
        this.isSubmitting = false;
        this.rejectionReason = '';
        this.selectedPayment = null;
        // Handle both string and object responses
        const message = typeof response === 'string' ? response : (response?.message || 'Payment request rejected successfully');
        this.showToast(message, 'success');
      },
      error: (err) => {
        this.isSubmitting = false;
        // Backend sometimes returns a plain-text 200 body, which Angular's HttpClient
        // fails to JSON.parse (Content-Type: application/json) and routes here instead
        // of `next`, with the raw text preserved on err.error.text.
        const errorMessage = err?.error?.text || err?.error?.message || err?.error || err?.message || 'Failed to reject payment. Please try again.';
        this.loadPayments();
        this.isRejectModalOpen = false;
        this.isDetailModalOpen = false;
        this.rejectionReason = '';
        this.selectedPayment = null;
        this.showToast(errorMessage, 'danger');
      },
    });
  }

  // ── Computed Stats ────────────────────────────────────────────────────────

  get stats() {
    // Prefer the logs (all payments, all statuses). Fall back to the pending list until they load.
    if (this.logsLoaded) {
      const bucket = (l: PaymentLog) => {
        const s = (l.status || '').toUpperCase();
        if (s.includes('REJECT')) return 'REJECTED';
        if (s.includes('APPROV') || s === 'LEDGER_UPDATED') return 'APPROVED';
        return 'PENDING'; // PAYMENT_ADDED / PENDING
      };
      const sum = (list: PaymentLog[]) => list.reduce((t, l) => t + (Number(l.amount) || 0), 0);
      const lp = this.allLogs.filter(l => bucket(l) === 'PENDING');
      const la = this.allLogs.filter(l => bucket(l) === 'APPROVED');
      const lr = this.allLogs.filter(l => bucket(l) === 'REJECTED');
      return {
        total:         this.allLogs.length,
        pendingCount:  lp.length,
        approvedCount: la.length,
        rejectedCount: lr.length,
        pendingAmount:  sum(lp),
        approvedAmount: sum(la),
      };
    }
    const pending  = this.allPayments.filter(p => p.status === 'PENDING');
    const approved = this.allPayments.filter(p => p.status === 'APPROVED');
    const rejected = this.allPayments.filter(p => p.status === 'REJECTED');
    return {
      total:         this.allPayments.length,
      pendingCount:  pending.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      pendingAmount:  pending.reduce((s, p) => s + p.amount, 0),
      approvedAmount: approved.reduce((s, p) => s + p.amount, 0),
    };
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  get paginatedPayments(): PaymentRequest[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredPayments.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredPayments.length / this.pageSize);
  }

  prevPage() { if (this.currentPage > 1) this.currentPage--; }
  nextPage() { if (this.currentPage < this.totalPages) this.currentPage++; }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getTabCount(tab: string): number {
    if (tab === 'ALL') return this.allPayments.length;
    if (tab === 'LOGS') return this.allLogs.length;
    return this.allPayments.filter(p => p.status === tab).length;
  }

  getTabLabel(tab: string): string {
    const labels: Record<string, string> = {
      ALL: 'All',
      PENDING: 'Payment Added',
      APPROVED: 'Payment Approved',
      REJECTED: 'Payment Rejected',
      LOGS: 'Payment Logs',
    };
    return labels[tab] ?? tab;
  }

  getStatusConfig(status: string): { color: string; bg: string; border: string; icon: string; label: string } {
    const map: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
      PENDING:  { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: 'time-outline',              label: 'Payment Added'    },
      APPROVED: { color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: 'checkmark-circle-outline',  label: 'Payment Approved' },
      REJECTED: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: 'close-circle-outline',      label: 'Payment Rejected' },
    };
    return map[status] ?? map['PENDING'];
  }

  getMethodConfig(method: string): { bg: string; color: string; icon: string } {
    const map: Record<string, { bg: string; color: string; icon: string }> = {
      RTGS:   { bg: '#eff6ff', color: '#1d4ed8', icon: 'business-outline'       },
      NEFT:   { bg: '#f5f3ff', color: '#6d28d9', icon: 'swap-vertical-outline'  },
      IMPS:   { bg: '#ecfdf5', color: '#059669', icon: 'phone-portrait-outline' },
      UPI:    { bg: '#fff7ed', color: '#c2410c', icon: 'phone-portrait-outline' },
      CHEQUE: { bg: '#fefce8', color: '#a16207', icon: 'document-text-outline'  },
    };
    return map[method] ?? { bg: '#f8fafc', color: '#475569', icon: 'card-outline' };
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', minimumFractionDigits: 2,
    }).format(amount);
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  formatDateTime(dateString: string): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  private showToast(message: string, color: 'success' | 'danger' | 'warning') {
    this.toast.present(message, color);
  }
}

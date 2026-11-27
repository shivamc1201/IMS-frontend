import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { Router, RouterModule } from '@angular/router';
import { SalesService } from '../../services/sales.service';
import { Toast } from '../../services/toast';
import {
  SalesHierarchyService,
  SalesPerson,
  OrderWithSalesPerson,
  HierarchyNode,
  HIERARCHY_ROLES
} from '../../services/sales-hierarchy.service';
import { HierarchyMapComponent } from '../hierarchy-map/hierarchy-map.component';
import { Auth } from '../../services/auth';

interface GroupedOrders {
  zone: string;
  rsms: RsmGroup[];
  totalOrders: number;
  totalAmount: number;
}

interface RsmGroup {
  rsm: SalesPerson | null;
  rsmName: string;
  asms: AsmGroup[];
  totalOrders: number;
  totalAmount: number;
  isExpanded: boolean;
}

interface AsmGroup {
  asm: SalesPerson | null;
  asmName: string;
  executives: SeGroup[];
  totalOrders: number;
  totalAmount: number;
  isExpanded: boolean;
}

interface SeGroup {
  se: SalesPerson | null;
  seName: string;
  orders: OrderWithSalesPerson[];
  totalAmount: number;
  isExpanded: boolean;
}

@Component({
  selector: 'app-hierarchy-orders',
  templateUrl: './hierarchy-orders.page.html',
  styleUrls: ['./hierarchy-orders.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, RouterModule]
})
export class HierarchyOrdersPage implements OnInit {
  isLoading = false;
  errorMessage = '';

  salesPersons: SalesPerson[] = [];
  allOrders: OrderWithSalesPerson[] = [];
  groupedData: GroupedOrders[] = [];

  // The salesperson record that corresponds to the currently logged-in user.
  // null means the user is not in the sales hierarchy (e.g. SUPER_ADMIN) → no filter.
  private currentSalesperson: SalesPerson | null = null;

  // Filters
  filterZone = '';
  filterStatus = '';
  filterSearch = '';
  zones: string[] = [];
  otherOrders: OrderWithSalesPerson[] = [];
  statuses = ['pending', 'approved', 'completed', 'rejected'];

  // Summary
  totalOrders = 0;
  totalAmount = 0;
  expandedZones = new Set<string>();

  // Track which orderId is currently being approved
  approvingOrderId: number | null = null;

  constructor(
    private hierarchyService: SalesHierarchyService,
    private modalController: ModalController,
    private auth: Auth,
    private salesService: SalesService,
    private router: Router,
    private toast: Toast
  ) {}

  ngOnInit() {
    this.loadData();
  }

  ionViewWillEnter() {
    this.loadData();
  }

  loadData() {
    this.isLoading = true;
    this.errorMessage = '';

    // Load salespersons and orders in parallel
    let personsLoaded = false;
    let ordersLoaded = false;

    this.hierarchyService.getAllSalesPersons().subscribe({
      next: (data) => {
        this.salesPersons = data;
        // Identify current logged-in user in the hierarchy by username.
        // SUPER_ADMIN won't have a salesperson record — currentSalesperson stays null (no filter).
        const loggedInUsername = this.auth.getUsername();
        this.currentSalesperson = loggedInUsername
          ? (this.salesPersons.find(p => p.username === loggedInUsername) ?? null)
          : null;
        personsLoaded = true;
        if (ordersLoaded) this.buildGroupedData();
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'Failed to load team data.';
      }
    });

    this.hierarchyService.getHierarchyOrders().subscribe({
      next: (data) => {
        this.allOrders = data;
        ordersLoaded = true;
        if (personsLoaded) this.buildGroupedData();
      },
      error: () => {
        // Show the failure instead of letting it look like there are no orders
        this.errorMessage = 'Failed to load orders. Pull down to retry.';
        this.allOrders = [];
        ordersLoaded = true;
        if (personsLoaded) this.buildGroupedData();
      }
    });
  }

  handlePullRefresh(event: any) {
    this.loadData();
    setTimeout(() => event.target.complete(), 1500);
  }

  buildGroupedData() {
    this.isLoading = false;
    const filtered = this.getFilteredOrders();
    const sumAmount = (list: OrderWithSalesPerson[]) => list.reduce((s, o) => s + (o.amount ?? 0), 0);

    const byId = new Map(this.salesPersons.map(p => [p.id, p]));
    const reportsOf = (managerId: number) => this.salesPersons.filter(p => p.managerId === managerId);

    // Everyone below a person, at any depth (e.g. Sales Officers and their Sales Executives).
    const teamOf = (managerId: number, seen = new Set<number>([managerId])): SalesPerson[] =>
      reportsOf(managerId)
        .filter(p => !seen.has(p.id))
        .reduce<SalesPerson[]>((team, p) => {
          seen.add(p.id);
          return team.concat(p, teamOf(p.id, seen));
        }, []);

    // A regional manager belongs to exactly one zone (own, else a manager's), so nothing is counted twice.
    const zoneOf = (person: SalesPerson): string => {
      const seen = new Set<number>();
      let current: SalesPerson | undefined = person;
      while (current && !seen.has(current.id)) {
        if (current.zone) return current.zone;
        seen.add(current.id);
        current = current.managerId != null ? byId.get(current.managerId) : undefined;
      }
      return 'No Zone';
    };

    const rsms = this.salesPersons.filter(p => p.role === 'REGIONAL_SALES_MGR');
    this.zones = [...new Set(rsms.map(zoneOf))].sort();

    const zonesToProcess = this.filterZone ? [this.filterZone] : this.zones;
    const placed = new Set<number>();

    const toMemberGroup = (member: SalesPerson): SeGroup => {
      const orders = filtered.filter(o => o.salespersonId === member.id);
      orders.forEach(o => placed.add(o.orderId));
      return { se: member, seName: member.name, orders, totalAmount: sumAmount(orders), isExpanded: false };
    };

    this.groupedData = zonesToProcess.map(zone => {
      const rsmGroups: RsmGroup[] = rsms.filter(r => zoneOf(r) === zone).map(rsm => {
        const asmGroups: AsmGroup[] = reportsOf(rsm.id)
          .filter(p => p.role === 'AREA_SALES_MGR')
          .map(asm => {
            const executives = teamOf(asm.id).map(toMemberGroup);

            // Orders owned by the area manager directly
            const own = toMemberGroup(asm);
            if (own.orders.length > 0) executives.unshift(own);

            const totalOrders = executives.reduce((s, g) => s + g.orders.length, 0);
            const totalAmount = executives.reduce((s, g) => s + g.totalAmount, 0);
            return { asm, asmName: asm.name, executives, totalOrders, totalAmount, isExpanded: true };
          });

        const totalOrders = asmGroups.reduce((s, g) => s + g.totalOrders, 0);
        const totalAmount = asmGroups.reduce((s, g) => s + g.totalAmount, 0);
        return { rsm, rsmName: rsm.name, asms: asmGroups, totalOrders, totalAmount, isExpanded: true };
      });

      const totalOrders = rsmGroups.reduce((s, g) => s + g.totalOrders, 0);
      const totalAmount = rsmGroups.reduce((s, g) => s + g.totalAmount, 0);
      return { zone, rsms: rsmGroups, totalOrders, totalAmount };
    }).filter(z => z.rsms.length > 0);

    // Orders that do not fit the tree (no salesperson, or owner outside any area team) stay visible.
    this.otherOrders = filtered.filter(o =>
      !placed.has(o.orderId) && (!this.filterZone || o.zone === this.filterZone)
    );

    const shown = [...filtered.filter(o => placed.has(o.orderId)), ...this.otherOrders];
    this.totalOrders = shown.length;
    this.totalAmount = sumAmount(shown);
  }

  /**
   * Returns the set of salesperson IDs that the current user is allowed to see orders for.
   * A user can see orders for themselves and everyone that reports to them (recursively).
   * Returns null when no restriction should be applied (SUPER_ADMIN or user not in hierarchy).
   */
  private getVisibleSalespersonIds(): Set<number> | null {
    // SUPER_ADMIN bypasses all hierarchy filtering.
    if (this.auth.isSuperAdmin()) return null;

    // If the logged-in user has no matching salesperson record, apply no filter as a safe fallback.
    if (!this.currentSalesperson) return null;

    // BFS: collect the current user's id + all subordinates' ids at every depth.
    const visibleIds = new Set<number>();
    const queue: number[] = [this.currentSalesperson.id];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      visibleIds.add(currentId);
      this.salesPersons
        .filter(p => p.managerId === currentId)
        .forEach(p => queue.push(p.id));
    }
    return visibleIds;
  }

  getFilteredOrders(): OrderWithSalesPerson[] {
    let list = [...this.allOrders];

    // Hierarchy visibility filter: only show orders assigned to salespersons
    // within the current user's subtree (themselves + all downward reports).
    // Orders assigned to someone ABOVE the current user are excluded.
    const visibleIds = this.getVisibleSalespersonIds();
    if (visibleIds !== null) {
      list = list.filter(o => o.salespersonId != null && visibleIds.has(o.salespersonId));
    }

    if (this.filterStatus) {
      list = list.filter(o => o.status?.toLowerCase() === this.filterStatus.toLowerCase());
    }
    if (this.filterSearch.trim()) {
      const t = this.filterSearch.toLowerCase();
      list = list.filter(o =>
        (o.distributorName ?? '').toLowerCase().includes(t) ||
        (o.salespersonName ?? '').toLowerCase().includes(t) ||
        String(o.orderId).includes(t)
      );
    }
    return list;
  }

  applyFilters() {
    this.buildGroupedData();
  }

  resetFilters() {
    this.filterZone = '';
    this.filterStatus = '';
    this.filterSearch = '';
    this.buildGroupedData();
  }

  isZoneExpanded(zone: string) {
    return this.expandedZones.has(zone);
  }

  toggleZone(zone: string) {
    if (this.expandedZones.has(zone)) {
      this.expandedZones.delete(zone);
    } else {
      this.expandedZones.add(zone);
    }
  }

  getStatusColor(status: string): string {
    const map: Record<string, string> = {
      pending: '#f59e0b',
      approved: '#10b981',
      completed: '#0ea5e9',
      rejected: '#f43f5e'
    };
    return map[status?.toLowerCase()] ?? '#64748b';
  }

  getStatusBg(status: string): string {
    const map: Record<string, string> = {
      pending: '#fef3c7',
      approved: '#ecfdf5',
      completed: '#e0f2fe',
      rejected: '#fff1f2'
    };
    return map[status?.toLowerCase()] ?? '#f1f5f9';
  }

  getStatusIcon(status: string): string {
    const map: Record<string, string> = {
      pending: 'time-outline',
      approved: 'checkmark-circle-outline',
      completed: 'check-done-outline',
      rejected: 'close-circle-outline'
    };
    return map[status?.toLowerCase()] ?? 'help-outline';
  }

  formatCurrency(amount: number): string {
    if (!amount) return '₹0';
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${amount.toLocaleString('en-IN')}`;
  }

  getRoleLabel(role: string): string {
    return HIERARCHY_ROLES.find(r => r.value === role)?.label ?? role;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  approveOrder(order: OrderWithSalesPerson) {
    if (this.approvingOrderId) return;
    this.approvingOrderId = order.orderId;
    this.salesService.approveOrder(order.orderId).subscribe({
      next: (res) => {
        this.approvingOrderId = null;
        const msg = res?.message || 'Order approved — ready for dispatch!';
        this.toast.present(msg, 'success');
        // Update local status so the badge refreshes immediately
        const found = this.allOrders.find(o => o.orderId === order.orderId);
        if (found) found.status = 'approved';
        this.buildGroupedData();
        setTimeout(() => this.router.navigate(['/dispatch']), 350);
      },
      error: (err) => {
        this.approvingOrderId = null;
        const msg = err?.error?.message || 'Failed to approve order. Please try again.';
        this.toast.present(msg, 'danger');
      }
    });
  }

  async openHierarchyMap() {
    const modal = await this.modalController.create({
      component: HierarchyMapComponent,
      presentingElement: await this.modalController.getTop(),
      cssClass: 'hierarchy-map-modal-xl',
      backdropDismiss: true,
      breakpoints: [0, 1],
      initialBreakpoint: 1
    });
    await modal.present();
  }
}

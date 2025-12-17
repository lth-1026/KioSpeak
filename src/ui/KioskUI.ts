
import { StoreProfileModule, MenuItem, } from '../modules/store_profile';
import { CartManager, CartSummary, } from '../modules/core/CartManager';

import { MockPaymentService, PaymentMethod } from '../modules/payment';

export class KioskUI {
  private container: HTMLElement;
  private storeProfile: StoreProfileModule;
  private cartManager: CartManager;
  private paymentService: MockPaymentService;

  private currentCategoryId: string | null = null;
  private currentModalItem: {
    menuItem: MenuItem;
    cartItemId: string; // Temporary ID or the actual ID if we pre-add to cart
    tempOptions: Map<string, string[]>; // groupId -> selectedOptionIds
  } | null = null;

  constructor(containerId: string, store: StoreProfileModule, cart: CartManager) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container #${containerId} not found`);
    this.container = el;
    this.storeProfile = store;
    this.cartManager = cart;
    this.paymentService = new MockPaymentService({ mode: 'alwaysSuccess', delayMs: 1000 });

    // Subscribe to Cart Changes
    this.cartManager.on('cartUpdated', (summary: CartSummary) => {
      this.renderCart(summary);
      if (this.currentModalItem) {
        this.renderModalOptions(); // Update modal if open
      }
    });
  }

  async init() {
    // Wait for store profile to be ready
    if (this.storeProfile.status !== 'ready') {
      await this.storeProfile.initialize();
    }

    // Layout Structure
    this.container.innerHTML = `
            <div class="kiosk-container">
                <header class="kiosk-header" style="position: relative;">
                    <div id="admin-trigger" style="position: absolute; top: 0; left: 0; width: 20px; height: 20px; cursor: pointer; z-index: 1000;" title="Admin"></div>
                    <div class="brand-logo">🍔 KioSpeak</div>
                </header>
                
                <div class="main-area">
                    <nav class="category-sidebar" id="category-nav"></nav>
                    <main class="menu-grid" id="menu-grid"></main>
                </div>

                <aside class="cart-sidebar">
                    <div class="cart-header">
                        <span>🛒 내 장바구니</span>
                        <button class="btn-sm" id="clear-cart" style="font-size: 0.8rem; padding: 0.3rem 0.6rem; background: #eee; border: none; border-radius: 4px; cursor: pointer;">전체 삭제</button>
                    </div>
                    <div class="cart-items" id="cart-items">
                        <!-- Items go here -->
                        <div style="text-align: center; color: #999; margin-top: 2rem;">
                            장바구니가 비어있습니다.
                        </div>
                    </div>
                    <div class="cart-footer">
                        <div class="total-row">
                            <span>총 결제금액</span>
                            <span style="color: var(--primary-color)" id="total-price">0원</span>
                        </div>
                        <button class="pay-btn" id="btn-open-payment">결제하기</button>
                    </div>
                </aside>
            </div>

            <!-- Option Modal -->
            <div class="modal-overlay" id="option-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modal-title">옵션 선택</h3>
                        <button class="btn-secondary" id="modal-close">✕</button>
                    </div>
                    <div class="modal-body" id="modal-options">
                        <!-- Options go here -->
                    </div>
                    <div class="modal-footer">
                        <span id="modal-price" style="font-weight: bold; font-size: 1.2rem; margin-right: auto;"></span>
                        <button class="btn-secondary" id="modal-cancel">선택 취소</button>
                        <button class="btn-primary" id="modal-confirm">선택 완료</button>
                    </div>
                </div>
            </div>

            <!-- Payment Modal -->
            <div class="modal-overlay" id="payment-modal">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>결제 수단 선택</h3>
                        <button class="btn-secondary" id="payment-modal-close">✕</button>
                    </div>
                    <div class="modal-body" style="text-align: center;">
                        <div style="margin-bottom: 2rem; font-size: 1.2rem;">
                            총 결제 금액: <span id="payment-total-price" style="font-weight: bold; color: var(--primary-color);">0원</span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <button class="btn-primary" id="pay-card" style="height: 120px; font-size: 1.2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #1976d2;">
                                <span style="font-size: 2rem; margin-bottom: 0.5rem;">💳</span>
                                카드 결제
                            </button>
                            <button class="btn-primary" id="pay-mobile" style="height: 120px; font-size: 1.2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #7b1fa2;">
                                <span style="font-size: 2rem; margin-bottom: 0.5rem;">📱</span>
                                모바일 결제
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

    // Event Listeners for Modal
    document.getElementById('modal-close')?.addEventListener('click', () => this.closeModal(true));
    document.getElementById('modal-cancel')?.addEventListener('click', () => this.cancelOptionSelection());
    document.getElementById('modal-confirm')?.addEventListener('click', () => this.confirmOptionSelection());

    // Event Listeners for Payment Modal
    document.getElementById('payment-modal-close')?.addEventListener('click', () => this.closePaymentModal());
    document.getElementById('pay-card')?.addEventListener('click', () => this.processPayment('CARD'));
    document.getElementById('pay-mobile')?.addEventListener('click', () => this.processPayment('MOBILE'));
    document.getElementById('btn-open-payment')?.addEventListener('click', () => this.openPaymentModal());

    // Clear Cart Listener
    document.getElementById('clear-cart')?.addEventListener('click', () => this.clearCart());

    // Admin Trigger
    document.getElementById('admin-trigger')?.addEventListener('click', () => {
      window.location.href = '/admin.html';
    });

    // Initial Render
    this.renderCategories();
    this.renderCart(this.cartManager.getCartSummary());
  }

  private cancelOptionSelection() {
    if (!this.currentModalItem) return;
    // Remove item from cart as requested
    this.cartManager.removeCartItem(this.currentModalItem.cartItemId);
    this.closeModal(false);
  }

  // ============ RENDER: Categories ============
  private renderCategories() {
    const categories = this.storeProfile.getCategories();
    // Sort by displayOrder
    categories.sort((a, b) => a.displayOrder - b.displayOrder);

    const nav = document.getElementById('category-nav');
    if (!nav) return;

    nav.innerHTML = categories.map(cat => `
            <div class="category-tab ${this.currentCategoryId === cat.id ? 'active' : ''}" 
                 data-id="${cat.id}">
                ${cat.name}
            </div>
        `).join('');

    // Event Listeners
    nav.querySelectorAll('.category-tab').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        if (id) this.selectCategory(id);
      });
    });

    // Select first category by default
    if (!this.currentCategoryId && categories.length > 0) {
      this.selectCategory(categories[0].id);
    }
  }

  private selectCategory(id: string) {
    this.currentCategoryId = id;

    // Update Active Tab
    document.querySelectorAll('.category-tab').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-id') === id);
    });

    this.renderMenu(id);
  }

  // ============ RENDER: Menu Grid ============
  private renderMenu(categoryId: string) {
    const category = this.storeProfile.getCategory(categoryId);
    const grid = document.getElementById('menu-grid');
    if (!grid || !category) return;

    grid.innerHTML = category.items.filter(item => item.available).map(item => `
            <div class="menu-item-card" data-id="${item.id}">
                <img src="${item.imgUrl || 'https://via.placeholder.com/150'}" class="item-image" alt="${item.name}">
                <div class="item-info">
                    <h3>${item.name}</h3>
                    <div class="item-price">${item.price.toLocaleString()}원</div>
                </div>
            </div>
        `).join('');

    // Event Listeners
    grid.querySelectorAll('.menu-item-card').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        if (id) this.handleItemClick(id);
      });
    });
  }

  // ============ INTERACTION: Item Click & Options ============
  private handleItemClick(itemId: string) {
    const item = this.storeProfile.getMenuItem(itemId);
    if (!item) return;

    // Try to add to cart directly first
    const result = this.cartManager.addToCart(item.name, 1);

    if (result.success) {
      if (result.pendingOptions && result.pendingOptions.length > 0 && result.cartItemId) {
        this.openModal(item, result.cartItemId);
      } else {
        // If there are valid option groups even if not active/pending (e.g. optional ones),
        // we might want to pop up the modal?
        // Current logic: only if pendingOptions > 0.
        // User request: "옵션 선택이 필수가 아닌 것들은 안 나타남 → 나타나게 변경"
        // Meaning: even if success (no required pending), if there are ANY option groups, show modal?
        // Let's check if the item has option groups.
        const cartItem = this.cartManager.getCartItem(result.cartItemId!);
        if (cartItem && cartItem.optionGroups && cartItem.optionGroups.length > 0) {
          this.openModal(item, result.cartItemId!);
        }
      }
    } else {
      alert(result.message);
    }
  }

  // Open modal for editing or initial selection
  public openModal(item: MenuItem, cartItemId: string) {
    this.currentModalItem = {
      menuItem: item,
      cartItemId: cartItemId,
      tempOptions: new Map()
    };

    const modal = document.getElementById('option-modal');
    const title = document.getElementById('modal-title');

    if (title) title.innerText = item.name;
    if (modal) modal.classList.add('open');

    this.renderModalOptions();
  }

  // Handle "X" or Cancel: Remove item if it was just added and not fully valid?
  // User request: "음료 선택이 안됐을 때 x를 선택하면 담기 취소 안내"
  // Actually, since we already added to cart in handleItemClick, we should remove it if the user cancels BEFORE confirming?
  // Or checking if it's "valid" (no pending required options).
  public closeModal(checkPending: boolean = false) {
    if (checkPending && this.currentModalItem) {
      const pending = this.cartManager.getPendingRequiredOptions(this.currentModalItem.cartItemId);
      // If there are pending requirements and user clicked Close, assume cancellation
      if (pending.length > 0) {
        if (confirm('옵션 선택을 완료하지 않았습니다. 메뉴 추가를 취소하시겠습니까?')) {
          this.cartManager.removeCartItem(this.currentModalItem.cartItemId);
        } else {
          return; // User cancelled the "Cancel", so stay in modal
        }
      }
    }

    const modal = document.getElementById('option-modal');
    if (modal) modal.classList.remove('open');
    this.currentModalItem = null;
  }

  private renderModalOptions() {
    if (!this.currentModalItem) return;

    const container = document.getElementById('modal-options');
    const priceEl = document.getElementById('modal-price');

    const cartItem = this.cartManager.getCartItem(this.currentModalItem.cartItemId);
    if (!container || !cartItem) return;

    // Calculate total
    const optionsPrice = cartItem.options.reduce((sum, opt) =>
      sum + opt.selectedItems.reduce((s, i) => s + i.price, 0), 0
    );
    const totalNodePrice = (cartItem.basePrice + optionsPrice) * cartItem.quantity;
    if (priceEl) priceEl.innerText = `${totalNodePrice.toLocaleString()}원`;


    // Render Groups
    if (!cartItem.optionGroups) {
      container.innerHTML = '옵션이 없습니다.';
      return;
    }

    container.innerHTML = cartItem.optionGroups.map(group => {
      // Check visibility (dependsOn)
      let isVisible = true;
      if (group.dependsOn) {
        const dependency = group.dependsOn;
        const parentSelection = cartItem.options.find(o => o.groupId === dependency.groupId);
        if (!parentSelection || !parentSelection.selectedItems.some(i => dependency.optionIds.includes(i.id))) {
          isVisible = false;
        }
      }

      if (!isVisible) return '';

      const currentSelection = cartItem.options.find(o => o.groupId === group.id);
      const selectedIds = currentSelection ? currentSelection.selectedItems.map(i => i.id) : [];

      return `
                <div class="option-group" data-group-id="${group.id}">
                    <div class="group-title">
                        ${group.name}
                        ${group.required ? '<span class="required-badge">필수</span>' : ''}
                        ${group.maxSelections ? `<span style="font-size:0.8em; color:#666; font-weight:normal">(최대 ${group.maxSelections}개)</span>` : ''}
                    </div>
                    <div class="option-list">
                        ${group.items.filter(opt => opt.available).map(opt => `
                            <div class="option-item ${selectedIds.includes(opt.id) ? 'selected' : ''}" 
                                 onclick="window.kioskUI.handleOptionClick('${group.id}', '${opt.id}')">
                                ${opt.imgUrl ? `<img src="${opt.imgUrl}" class="option-img">` : ''}
                                <div>${opt.name}</div>
                                ${opt.price > 0 ? `<div style="font-size:0.9em; color:#666">+${opt.price.toLocaleString()}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
    }).join('');
  }

  public handleOptionClick(groupId: string, optionId: string) {
    if (!this.currentModalItem) return;

    const result = this.cartManager.selectOption(this.currentModalItem.cartItemId, groupId, optionId);

    if (!result.success) {
      if (result.message.includes('최대')) alert(result.message);
    }
    this.renderModalOptions();
  }

  private confirmOptionSelection() {
    if (!this.currentModalItem) return;

    const pending = this.cartManager.getPendingRequiredOptions(this.currentModalItem.cartItemId);
    if (pending.length > 0) {
      alert(`${pending[0].name}을(를) 선택해주세요.`);
      return;
    }

    this.closeModal(false); // No need to check pending, explicitly confirmed
  }


  // ============ RENDER: Cart Sidebar ============
  private renderCart(summary: CartSummary) {
    const container = document.getElementById('cart-items');
    const totalEl = document.getElementById('total-price');

    if (!container || !totalEl) return;

    if (summary.totalItems === 0) {
      container.innerHTML = `
                <div style="text-align: center; color: #999; margin-top: 2rem;">
                    장바구니가 비어있습니다.
                </div>
            `;
      totalEl.innerText = '0원';
      return;
    }

    container.innerHTML = summary.items.map(item => `
            <div class="cart-item">
                <div class="cart-item-header">
                    <span>${item.menuName}</span>
                    <span>${item.itemTotal.toLocaleString()}원</span>
                </div>
                ${item.options.length > 0 ? `
                <div class="cart-item-options">
                    ${item.options.join(', ')}
                </div>` : ''}
                
                <!-- Option Change Button (New) -->
                ${this.hasConfigurableOptions(item.cartItemId) ?
        `<button class="btn-edit" 
                        onclick="window.kioskUI.reconfigureItem('${item.cartItemId}')">
                        옵션 변경
                     </button>`
        : ''}

                <div class="cart-item-controls">
                    <div class="qty-control">
                        <button class="qty-btn" onclick="window.kioskUI.updateQty('${item.cartItemId}', ${item.quantity - 1})">-</button>
                        <span>${item.quantity}</span>
                        <button class="qty-btn" onclick="window.kioskUI.updateQty('${item.cartItemId}', ${item.quantity + 1})">+</button>
                    </div>
                    <button class="qty-btn" style="color: #ff5722" onclick="window.kioskUI.removeItem('${item.cartItemId}')">✕</button>
                </div>
            </div>
        `).join('');

    totalEl.innerText = `${summary.totalPrice.toLocaleString()}원`;
  }

  // Helper to check if item has options to configure
  private hasConfigurableOptions(cartItemId: string): boolean {
    const item = this.cartManager.getCartItem(cartItemId);
    return !!(item && item.optionGroups && item.optionGroups.length > 0);
  }

  // Public methods for globals
  public reconfigureItem(cartItemId: string) {
    const item = this.cartManager.getCartItem(cartItemId);
    if (!item) return;

    // Need original MenuItem to re-open modal correctly
    // StoreProfileModule can find it? Or CartItem has enough info?
    // CartItem stores 'menuName', but not full MenuItem object usually.
    // But we can find it via StoreProfile if we had IDs. 
    // Current CartItem structure might not store original MenuItem ID?
    // Let's check CartManager.ts Types... 
    // It seems CartItem interface might need 'menuId' to fully link back?
    // Actually CartItem has `menuName`, we can try `getMenuItemByName` if unique?
    // Or better, let's assume we can find it. 

    // Ideally CartManager should store menuId. checking...
    // Assuming we can find the menu item by name for now, or we need to update CartManager to store menuId.
    // For this session, let's try finding by Name from StoreProfile

    const category = this.storeProfile.getCategories().find(c =>
      c.items.find(i => i.name === item.menuName)
    );
    const menuItem = category?.items.find(i => i.name === item.menuName);

    if (menuItem) {
      this.openModal(menuItem, cartItemId);
    }
  }

  public updateQty(cartItemId: string, newQty: number) {
    if (newQty <= 0) {
      if (confirm('정말 삭제하시겠습니까?')) {
        this.cartManager.removeCartItem(cartItemId);
      }
    } else {
      this.cartManager.updateQuantity(cartItemId, newQty);
    }
  }

  public removeItem(cartItemId: string) {
    if (confirm('정말 삭제하시겠습니까?')) {
      this.cartManager.removeCartItem(cartItemId);
    }
  }

  public clearCart() {
    if (this.cartManager.getCartSummary().totalItems === 0) return;

    if (confirm('장바구니를 모두 비우시겠습니까?')) {
      this.cartManager.clearCart();
    }
  }

  // ============ PAYMENT ============

  public openPaymentModal() {
    const summary = this.cartManager.getCartSummary();
    if (summary.totalItems === 0) {
      alert('장바구니가 비어있습니다.');
      return;
    }

    const modal = document.getElementById('payment-modal');
    const priceEl = document.getElementById('payment-total-price');

    if (priceEl) priceEl.innerText = `${summary.totalPrice.toLocaleString()}원`;
    if (modal) modal.classList.add('open');
  }

  public closePaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (modal) modal.classList.remove('open');
  }

  public async processPayment(method: PaymentMethod) {
    // Disable buttons to prevent double click
    const cardBtn = document.getElementById('pay-card') as HTMLButtonElement;
    const mobileBtn = document.getElementById('pay-mobile') as HTMLButtonElement;

    if (cardBtn) cardBtn.disabled = true;
    if (mobileBtn) mobileBtn.disabled = true;

    try {
      const summary = this.cartManager.getCartSummary();
      const result = await this.paymentService.requestPayment({
        orderId: `order_${Date.now()}`,
        orderName: summary.items.length === 1 ? summary.items[0].menuName : `${summary.items[0].menuName} 외 ${summary.totalItems - 1}건`,
        amount: summary.totalPrice,
        method: method
      });

      if (result.success) {
        alert(`결제가 완료되었습니다.\n거래번호: ${result.transactionId}`);
        this.cartManager.clearCart();
        this.closePaymentModal();
      } else {
        alert(`결제 실패: ${result.failureReason}`);
      }
    } catch (e) {
      alert(`오류 발생: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (cardBtn) cardBtn.disabled = false;
      if (mobileBtn) mobileBtn.disabled = false;
    }
  }
}

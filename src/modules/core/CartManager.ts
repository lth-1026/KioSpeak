import { StoreProfileModule } from '../store_profile';

export interface CartItem {
	menuId: string;
	menuName: string;
	price: number;
	quantity: number;
	options: string[];
}

export class CartManager {
	private cart: CartItem[] = [];
	private storeProfile: StoreProfileModule | null = null;

	constructor(storeProfile?: StoreProfileModule) {
		this.storeProfile = storeProfile || null;
	}

	setStoreProfile(storeProfile: StoreProfileModule): void {
		this.storeProfile = storeProfile;
	}

	// 메뉴 추가 함수 (Gemini가 호출)
	addToCart(menuName: string, quantity: number = 1): string {
		// StoreProfileModule을 사용하여 메뉴 정보 조회
		let menuId = menuName;
		let price = 0;

		if (this.storeProfile && this.storeProfile.status === 'ready') {
			const items = this.storeProfile.getMenuItems();
			const item = items.find(i => i.name === menuName);
			if (item) {
				menuId = item.id;
				price = item.price;
			}
		}

		this.cart.push({
			menuId,
			menuName,
			price,
			quantity,
			options: []
		});
		console.log(`[Core] 장바구니 추가됨: ${menuName} ${quantity}개 (${price}원)`);
		return `장바구니에 ${menuName} ${quantity}개가 담겼습니다. 옵션을 선택해주세요.`;
	}

	// 옵션 추가 함수 (Gemini가 호출)
	addOptionToItem(menuName: string, optionName: string): string {
		const item = this.cart.find(i => i.menuName === menuName);
		if (item) {
			item.options.push(optionName);
			console.log(`[Core] 옵션 추가됨: ${menuName} - ${optionName}`);
			return `${menuName}에 ${optionName} 옵션이 적용되었습니다.`;
		}
		return "해당 메뉴를 장바구니에서 찾을 수 없습니다.";
	}

	getCartSummary(): string {
		return JSON.stringify(this.cart);
	}

	getCart(): CartItem[] {
		return [...this.cart];
	}

	getTotal(): number {
		return this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
	}

	clearCart(): void {
		this.cart = [];
	}
}
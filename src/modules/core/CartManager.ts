export interface CartItem {
	menuId: string;
	menuName: string;
	quantity: number;
	options: string[];
}

export class CartManager {
	private cart: CartItem[] = [];

	// 메뉴 추가 함수 (Gemini가 호출)
	addToCart(menuName: string, quantity: number = 1): string {
		// 실제로는 menu.json을 조회하여 정확한 ID 매핑 필요
		this.cart.push({
			menuId: menuName, // 간소화됨
			menuName: menuName,
			quantity,
			options: []
		});
		console.log(`[Core] 장바구니 추가됨: ${menuName} ${quantity}개`);
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
}
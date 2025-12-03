import { v4 as uuidv4 } from 'uuid';
import { StoreProfileModule, MenuItem, MenuOptionGroup } from '../store_profile';

// ============ Types ============

export interface SelectedOptionItem {
	id: string;
	name: string;
	price: number;
}

export interface SelectedOption {
	groupId: string;
	groupName: string;
	selectedItems: SelectedOptionItem[];
}

export interface CartItem {
	cartItemId: string;
	menuId: string;
	menuName: string;
	basePrice: number;
	quantity: number;
	options: SelectedOption[];
	optionGroups?: MenuOptionGroup[]; // 선택 가능한 옵션 그룹 정보
}

export interface CartOperationResult {
	success: boolean;
	message: string;
	cartItemId?: string;
	pendingOptions?: MenuOptionGroup[]; // 아직 선택하지 않은 필수 옵션
	cart?: CartItem[];
}

export interface CartSummary {
	items: {
		cartItemId: string;
		menuName: string;
		quantity: number;
		basePrice: number;
		optionsPrice: number;
		itemTotal: number;
		options: string[];
	}[];
	totalItems: number;
	totalPrice: number;
}

// ============ CartManager Class ============

export class CartManager {
	private cart: CartItem[] = [];
	private storeProfile: StoreProfileModule | null = null;

	constructor(storeProfile?: StoreProfileModule) {
		this.storeProfile = storeProfile || null;
	}

	setStoreProfile(storeProfile: StoreProfileModule): void {
		this.storeProfile = storeProfile;
	}

	// ============ CREATE ============

	/**
	 * 장바구니에 메뉴 추가
	 */
	addToCart(menuName: string, quantity: number = 1): CartOperationResult {
		// StoreProfileModule에서 메뉴 정보 조회
		if (!this.storeProfile || this.storeProfile.status !== 'ready') {
			return {
				success: false,
				message: '스토어 정보가 준비되지 않았습니다.',
			};
		}

		const menuItem = this.storeProfile.getMenuItemByName(menuName);
		if (!menuItem) {
			return {
				success: false,
				message: `"${menuName}" 메뉴를 찾을 수 없습니다.`,
			};
		}

		if (!menuItem.available) {
			return {
				success: false,
				message: `"${menuName}"은(는) 현재 품절입니다.`,
			};
		}

		const cartItemId = uuidv4();
		const cartItem: CartItem = {
			cartItemId,
			menuId: menuItem.id,
			menuName: menuItem.name,
			basePrice: menuItem.price,
			quantity,
			options: [],
			optionGroups: menuItem.optionGroups,
		};

		this.cart.push(cartItem);
		console.log(`[CartManager] 장바구니 추가: ${menuName} ${quantity}개 (${menuItem.price}원)`);

		// 필수 옵션 확인
		const pendingOptions = this.getPendingRequiredOptions(cartItemId);

		if (pendingOptions.length > 0) {
			return {
				success: true,
				message: `장바구니에 ${menuName} ${quantity}개가 담겼습니다. 옵션을 선택해주세요.`,
				cartItemId,
				pendingOptions,
			};
		}

		return {
			success: true,
			message: `장바구니에 ${menuName} ${quantity}개가 담겼습니다.`,
			cartItemId,
		};
	}

	/**
	 * 장바구니 아이템에 옵션 선택
	 */
	selectOption(cartItemId: string, groupId: string, optionId: string): CartOperationResult {
		const cartItem = this.cart.find((item) => item.cartItemId === cartItemId);
		if (!cartItem) {
			return {
				success: false,
				message: '장바구니에서 해당 아이템을 찾을 수 없습니다.',
			};
		}

		const optionGroup = cartItem.optionGroups?.find((g) => g.id === groupId);
		if (!optionGroup) {
			return {
				success: false,
				message: `"${groupId}" 옵션 그룹을 찾을 수 없습니다.`,
			};
		}

		// 의존성 검증
		if (optionGroup.dependsOn) {
			const dependentOption = cartItem.options.find(
				(o) => o.groupId === optionGroup.dependsOn!.groupId
			);
			if (!dependentOption) {
				return {
					success: false,
					message: `먼저 다른 옵션을 선택해주세요.`,
				};
			}
			const hasRequiredSelection = dependentOption.selectedItems.some((item) =>
				optionGroup.dependsOn!.optionIds.includes(item.id)
			);
			if (!hasRequiredSelection) {
				return {
					success: false,
					message: `이 옵션은 현재 선택할 수 없습니다.`,
				};
			}
		}

		const optionItem = optionGroup.items.find((o) => o.id === optionId);
		if (!optionItem) {
			return {
				success: false,
				message: `"${optionId}" 옵션을 찾을 수 없습니다.`,
			};
		}

		if (!optionItem.available) {
			return {
				success: false,
				message: `"${optionItem.name}"은(는) 현재 선택할 수 없습니다.`,
			};
		}

		// 기존 선택 확인
		let existingOption = cartItem.options.find((o) => o.groupId === groupId);

		if (optionGroup.multiSelect) {
			// 다중 선택 모드
			if (!existingOption) {
				existingOption = {
					groupId,
					groupName: optionGroup.name,
					selectedItems: [],
				};
				cartItem.options.push(existingOption);
			}

			// 이미 선택된 경우 제거 (토글)
			const existingIdx = existingOption.selectedItems.findIndex((i) => i.id === optionId);
			if (existingIdx >= 0) {
				existingOption.selectedItems.splice(existingIdx, 1);
				console.log(`[CartManager] 옵션 제거: ${optionItem.name}`);
				return {
					success: true,
					message: `${optionItem.name} 선택이 해제되었습니다.`,
					cartItemId,
				};
			}

			// 최대 선택 개수 확인
			if (
				optionGroup.maxSelections &&
				existingOption.selectedItems.length >= optionGroup.maxSelections
			) {
				return {
					success: false,
					message: `최대 ${optionGroup.maxSelections}개까지만 선택할 수 있습니다.`,
				};
			}

			existingOption.selectedItems.push({
				id: optionItem.id,
				name: optionItem.name,
				price: optionItem.price,
			});
		} else {
			// 단일 선택 모드 - 기존 선택 교체
			if (existingOption) {
				existingOption.selectedItems = [
					{
						id: optionItem.id,
						name: optionItem.name,
						price: optionItem.price,
					},
				];
			} else {
				cartItem.options.push({
					groupId,
					groupName: optionGroup.name,
					selectedItems: [
						{
							id: optionItem.id,
							name: optionItem.name,
							price: optionItem.price,
						},
					],
				});
			}
		}

		console.log(`[CartManager] 옵션 선택: ${cartItem.menuName} - ${optionGroup.name}: ${optionItem.name}`);

		// 가격 정보 포함
		const priceInfo = optionItem.price > 0 ? ` (+${optionItem.price}원)` : '';

		// 다음 필수 옵션 확인
		const pendingOptions = this.getPendingRequiredOptions(cartItemId);

		return {
			success: true,
			message: `${optionGroup.name}에서 ${optionItem.name}${priceInfo}을(를) 선택했습니다.`,
			cartItemId,
			pendingOptions: pendingOptions.length > 0 ? pendingOptions : undefined,
		};
	}

	// ============ READ ============

	/**
	 * 특정 장바구니 아이템 조회
	 */
	getCartItem(cartItemId: string): CartItem | undefined {
		return this.cart.find((item) => item.cartItemId === cartItemId);
	}

	/**
	 * 메뉴 ID로 장바구니 아이템들 조회
	 */
	getCartItemsByMenu(menuId: string): CartItem[] {
		return this.cart.filter((item) => item.menuId === menuId);
	}

	/**
	 * 전체 장바구니 조회
	 */
	getCart(): CartItem[] {
		return [...this.cart];
	}

	/**
	 * 총 금액 계산
	 */
	getTotal(): number {
		return this.cart.reduce((sum, item) => {
			const optionsPrice = item.options.reduce(
				(optSum, opt) => optSum + opt.selectedItems.reduce((s, i) => s + i.price, 0),
				0
			);
			return sum + (item.basePrice + optionsPrice) * item.quantity;
		}, 0);
	}

	/**
	 * 장바구니 요약 정보
	 */
	getCartSummary(): CartSummary {
		const items = this.cart.map((item) => {
			const optionsPrice = item.options.reduce(
				(sum, opt) => sum + opt.selectedItems.reduce((s, i) => s + i.price, 0),
				0
			);
			const itemTotal = (item.basePrice + optionsPrice) * item.quantity;
			const optionNames = item.options.flatMap((o) =>
				o.selectedItems.map((i) => i.name)
			);

			return {
				cartItemId: item.cartItemId,
				menuName: item.menuName,
				quantity: item.quantity,
				basePrice: item.basePrice,
				optionsPrice,
				itemTotal,
				options: optionNames,
			};
		});

		return {
			items,
			totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
			totalPrice: this.getTotal(),
		};
	}

	/**
	 * 아직 선택하지 않은 필수 옵션 조회
	 */
	getPendingRequiredOptions(cartItemId: string): MenuOptionGroup[] {
		const cartItem = this.cart.find((item) => item.cartItemId === cartItemId);
		if (!cartItem || !cartItem.optionGroups) return [];

		return cartItem.optionGroups.filter((group) => {
			if (!group.required) return false;

			// 의존성 체크 - 의존하는 옵션이 선택되지 않았으면 pending이 아님
			if (group.dependsOn) {
				const dependentOption = cartItem.options.find(
					(o) => o.groupId === group.dependsOn!.groupId
				);
				if (!dependentOption) return false;

				const hasRequiredSelection = dependentOption.selectedItems.some((item) =>
					group.dependsOn!.optionIds.includes(item.id)
				);
				if (!hasRequiredSelection) return false;
			}

			// 이미 선택했는지 확인
			const selected = cartItem.options.find((o) => o.groupId === group.id);
			return !selected || selected.selectedItems.length === 0;
		});
	}

	// ============ UPDATE ============

	/**
	 * 수량 변경
	 */
	updateQuantity(cartItemId: string, quantity: number): CartOperationResult {
		const cartItem = this.cart.find((item) => item.cartItemId === cartItemId);
		if (!cartItem) {
			return {
				success: false,
				message: '장바구니에서 해당 아이템을 찾을 수 없습니다.',
			};
		}

		if (quantity <= 0) {
			return this.removeCartItem(cartItemId);
		}

		const oldQuantity = cartItem.quantity;
		cartItem.quantity = quantity;
		console.log(`[CartManager] 수량 변경: ${cartItem.menuName} ${oldQuantity}개 → ${quantity}개`);

		return {
			success: true,
			message: `${cartItem.menuName}의 수량이 ${quantity}개로 변경되었습니다.`,
			cartItemId,
		};
	}

	/**
	 * 옵션 업데이트 (교체)
	 */
	updateOption(cartItemId: string, groupId: string, optionIds: string[]): CartOperationResult {
		const cartItem = this.cart.find((item) => item.cartItemId === cartItemId);
		if (!cartItem) {
			return {
				success: false,
				message: '장바구니에서 해당 아이템을 찾을 수 없습니다.',
			};
		}

		const optionGroup = cartItem.optionGroups?.find((g) => g.id === groupId);
		if (!optionGroup) {
			return {
				success: false,
				message: `"${groupId}" 옵션 그룹을 찾을 수 없습니다.`,
			};
		}

		// 새 선택 항목 구성
		const newSelectedItems: SelectedOptionItem[] = [];
		for (const optionId of optionIds) {
			const optionItem = optionGroup.items.find((o) => o.id === optionId);
			if (!optionItem) {
				return {
					success: false,
					message: `"${optionId}" 옵션을 찾을 수 없습니다.`,
				};
			}
			if (!optionItem.available) {
				return {
					success: false,
					message: `"${optionItem.name}"은(는) 현재 선택할 수 없습니다.`,
				};
			}
			newSelectedItems.push({
				id: optionItem.id,
				name: optionItem.name,
				price: optionItem.price,
			});
		}

		// 기존 옵션 업데이트 또는 새로 추가
		const existingIdx = cartItem.options.findIndex((o) => o.groupId === groupId);
		if (existingIdx >= 0) {
			cartItem.options[existingIdx].selectedItems = newSelectedItems;
		} else {
			cartItem.options.push({
				groupId,
				groupName: optionGroup.name,
				selectedItems: newSelectedItems,
			});
		}

		const optionNames = newSelectedItems.map((i) => i.name).join(', ');
		console.log(`[CartManager] 옵션 업데이트: ${cartItem.menuName} - ${optionGroup.name}: ${optionNames}`);

		return {
			success: true,
			message: `${optionGroup.name}이(가) ${optionNames}(으)로 변경되었습니다.`,
			cartItemId,
		};
	}

	// ============ DELETE ============

	/**
	 * 장바구니 아이템 삭제
	 */
	removeCartItem(cartItemId: string): CartOperationResult {
		const idx = this.cart.findIndex((item) => item.cartItemId === cartItemId);
		if (idx < 0) {
			return {
				success: false,
				message: '장바구니에서 해당 아이템을 찾을 수 없습니다.',
			};
		}

		const removed = this.cart.splice(idx, 1)[0];
		console.log(`[CartManager] 장바구니에서 삭제: ${removed.menuName}`);

		return {
			success: true,
			message: `${removed.menuName}이(가) 장바구니에서 삭제되었습니다.`,
		};
	}

	/**
	 * 특정 옵션 그룹 선택 해제
	 */
	removeOptionFromCartItem(cartItemId: string, groupId: string): CartOperationResult {
		const cartItem = this.cart.find((item) => item.cartItemId === cartItemId);
		if (!cartItem) {
			return {
				success: false,
				message: '장바구니에서 해당 아이템을 찾을 수 없습니다.',
			};
		}

		const optionIdx = cartItem.options.findIndex((o) => o.groupId === groupId);
		if (optionIdx < 0) {
			return {
				success: false,
				message: '해당 옵션이 선택되어 있지 않습니다.',
			};
		}

		const removed = cartItem.options.splice(optionIdx, 1)[0];
		console.log(`[CartManager] 옵션 제거: ${cartItem.menuName} - ${removed.groupName}`);

		return {
			success: true,
			message: `${removed.groupName} 선택이 해제되었습니다.`,
			cartItemId,
		};
	}

	/**
	 * 장바구니 전체 비우기
	 */
	clearCart(): void {
		this.cart = [];
		console.log('[CartManager] 장바구니 비움');
	}
}

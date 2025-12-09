import { Tool, Type } from '@google/genai';

export const toolDefinitions: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "addToCart",
        description: "장바구니에 메뉴를 추가합니다. 추가 후 cartItemId와 선택해야 할 옵션 그룹 정보를 반환합니다.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            menuName: { type: Type.STRING, description: "추가할 메뉴 이름 (예: 불고기 버거, 콜라)" },
            quantity: { type: Type.NUMBER, description: "수량 (기본값: 1)" }
          },
          required: ["menuName"]
        }
      },
      {
        name: "selectOption",
        description: "장바구니 아이템에 옵션을 선택합니다. 의존성이 있는 옵션은 선행 옵션 선택 후에만 선택 가능합니다.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cartItemId: { type: Type.STRING, description: "장바구니 아이템 ID (addToCart 결과에서 받음)" },
            groupId: { type: Type.STRING, description: "옵션 그룹 ID (예: set_choice, drink, size)" },
            optionId: { type: Type.STRING, description: "선택할 옵션 ID (예: set, single, cola, large)" }
          },
          required: ["cartItemId", "groupId", "optionId"]
        }
      },
      {
        name: "updateQuantity",
        description: "장바구니 아이템의 수량을 변경합니다.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cartItemId: { type: Type.STRING, description: "장바구니 아이템 ID" },
            quantity: { type: Type.NUMBER, description: "변경할 수량" }
          },
          required: ["cartItemId", "quantity"]
        }
      },
      {
        name: "removeFromCart",
        description: "장바구니에서 아이템을 삭제합니다.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cartItemId: { type: Type.STRING, description: "삭제할 장바구니 아이템 ID" }
          },
          required: ["cartItemId"]
        }
      },
      {
        name: "getCart",
        description: "현재 장바구니 상태를 조회합니다.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: []
        }
      },
      {
        name: "getMenu",
        description: "판매 중인 메뉴 목록을 조회합니다. 대화 시작 시 반드시 호출하여 메뉴를 파악하세요.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: []
        }
      },
      {
        name: "processPayment",
        description: "장바구니의 주문을 결제합니다. 고객이 결제를 요청하고 결제 방법을 선택했을 때 호출합니다.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            method: {
              type: Type.STRING,
              description: "결제 방법 (CARD: 카드결제, MOBILE: 모바일결제)",
              enum: ["CARD", "MOBILE"]
            }
          },
          required: ["method"]
        }
      }
    ]
  }
];

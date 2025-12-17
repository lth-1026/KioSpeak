import { Tool, Type } from '@google/genai';

export const toolDefinitions: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "addToCart",
        description: "Adds a menu item to the cart by menu name. Returns: cartItemId (SAVE THIS - required for all subsequent operations on this item) and pendingOptions array. If pendingOptions is not empty, you MUST ask the customer about each option group in order before proceeding. Use exact option IDs from pendingOptions.items[].id when calling selectOption.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            menuName: { type: Type.STRING, description: "Exact menu name from getMenu response (e.g., '불고기 버거', '콜라'). Must match name field exactly." },
            quantity: { type: Type.NUMBER, description: "Quantity to add (default: 1)" },
            initialOptionNames: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Optional list of option names to select immediately (e.g., ['세트', '콜라', '라지']). Use this if the user mentioned options in the add command."
            }
          },
          required: ["menuName"]
        }
      },
      {
        name: "selectOption",
        description: "Selects OR changes an option for a cart item. Use this to fulfilling pending options OR to modify existing selections (e.g. changing from 'Single' to 'Set', or changing drink). If validation fails (e.g., dependency not met), asking the user for clarification. Check response for updated pending options.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cartItemId: { type: Type.STRING, description: "Cart item ID from addToCart response or getCart response. Format: 'cart_xxx'." },
            groupId: { type: Type.STRING, description: "Option group ID. For pending options, use value from pendingOptions[].groupId. For modifying existing items, find the group ID from getCart or getMenu (e.g., 'set_choice', 'drink')." },
            optionId: { type: Type.STRING, description: "Option ID to select. Use exact value from pendingOptions or getMenu (e.g., 'set', 'single', 'cola')." }
          },
          required: ["cartItemId", "groupId", "optionId"]
        }
      },
      {
        name: "updateQuantity",
        description: "Changes the quantity of a cart item. IMPORTANT: Call getCart first to find the cartItemId of the item to modify. Setting quantity to 0 removes the item from cart.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cartItemId: { type: Type.STRING, description: "Cart item ID from getCart response. Format: 'cart_xxx'." },
            quantity: { type: Type.NUMBER, description: "New quantity. Use 0 to remove the item." }
          },
          required: ["cartItemId", "quantity"]
        }
      },
      {
        name: "removeFromCart",
        description: "Removes an item from the cart permanently. IMPORTANT: Call getCart first to find the correct cartItemId. Confirm with customer before removing.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cartItemId: { type: Type.STRING, description: "Cart item ID from getCart response. Format: 'cart_xxx'." }
          },
          required: ["cartItemId"]
        }
      },
      {
        name: "getCart",
        description: "Retrieves the current cart state including all items, their options, quantities, and prices. MUST be called before any cart modification (updateQuantity, removeFromCart, selectOption on existing items) to get the correct cartItemId. Also use to show order summary before payment.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: []
        }
      },
      {
        name: "getMenu",
        description: "Retrieves all available menu items with prices, categories, and optionGroups. MUST be called at conversation start before taking any orders. Returns items with available: false for sold-out items - inform customer these cannot be ordered. Menu names returned here should be used for addToCart menuName parameter.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: []
        }
      },
      {
        name: "openPaymentModal",
        description: "Opens the payment method selection modal on the screen. Call this when the customer indicates they want to pay, but hasn't specified a payment method yet. Ask '카드와 모바일 결제 중 어떤 걸로 도와드릴까요?' after calling this.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: []
        }
      },
      {
        name: "changeCategory",
        description: "Switches the menu category displayed on the screen. Use this when the customer wants to see a specific category (e.g., 'Show me drinks', 'Recommend something'). Use categoryId from getMenu response.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            categoryId: { type: Type.STRING, description: "Category ID to switch to. Must match one of the IDs from getMenu." }
          },
          required: ["categoryId"]
        }
      },
      {
        name: "processPayment",
        description: "Processes payment and completes the order. Call this ONLY if the user explicitly mentions the payment method (e.g., 'Pay with card'). If method is unknown, call openPaymentModal instead. On success, cart is cleared and order is complete.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            method: {
              type: Type.STRING,
              description: "Payment method chosen by customer. CARD: card payment, MOBILE: mobile payment (e.g., Samsung Pay, Kakao Pay)",
              enum: ["CARD", "MOBILE"]
            }
          },
          required: ["method"]
        }
      }
    ]
  }
];

import { Tool, Type } from '@google/genai';

export const toolDefinitions: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "addToCart",
        description: "Adds a menu item to the cart. Returns cartItemId and option group information that needs to be selected.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            menuName: { type: Type.STRING, description: "Name of the menu item to add (e.g., Bulgogi Burger, Cola)" },
            quantity: { type: Type.NUMBER, description: "Quantity (default: 1)" }
          },
          required: ["menuName"]
        }
      },
      {
        name: "selectOption",
        description: "Selects an option for a cart item. Options with dependencies can only be selected after the prerequisite option is selected.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cartItemId: { type: Type.STRING, description: "Cart item ID (received from addToCart result)" },
            groupId: { type: Type.STRING, description: "Option group ID (e.g., set_choice, drink, size)" },
            optionId: { type: Type.STRING, description: "Option ID to select (e.g., set, single, cola, large)" }
          },
          required: ["cartItemId", "groupId", "optionId"]
        }
      },
      {
        name: "updateQuantity",
        description: "Changes the quantity of a cart item.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cartItemId: { type: Type.STRING, description: "Cart item ID" },
            quantity: { type: Type.NUMBER, description: "New quantity" }
          },
          required: ["cartItemId", "quantity"]
        }
      },
      {
        name: "removeFromCart",
        description: "Removes an item from the cart.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cartItemId: { type: Type.STRING, description: "Cart item ID to remove" }
          },
          required: ["cartItemId"]
        }
      },
      {
        name: "getCart",
        description: "Retrieves the current cart state.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: []
        }
      },
      {
        name: "getMenu",
        description: "Retrieves the list of available menu items. Must be called at the start of conversation to understand the menu.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: []
        }
      },
      {
        name: "processPayment",
        description: "Processes payment for the cart order. Call when customer requests payment and selects payment method.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            method: {
              type: Type.STRING,
              description: "Payment method (CARD: card payment, MOBILE: mobile payment)",
              enum: ["CARD", "MOBILE"]
            }
          },
          required: ["method"]
        }
      }
    ]
  }
];

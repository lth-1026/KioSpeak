// src/modules/llm/GeminiRealtimeClient.ts
import EventEmitter from 'eventemitter3';
import { GoogleGenAI, LiveServerMessage, Modality, Session, Tool, Type } from '@google/genai';
import { CartManager, CartItem, CartOperationResult } from '../core/CartManager';
import { StoreProfileModule } from '../store_profile';
import { MockPaymentService, PaymentMethod } from '../payment';
import { decode, decodeAudioData } from './utils';
import { AgeGroup } from '../../shared/types';

export type ConnectionMode = 'audio' | 'text';

export class GeminiRealtimeClient extends EventEmitter {
  private client: GoogleGenAI;
  private session: Session | null = null;
  private cartManager: CartManager;
  private storeProfile: StoreProfileModule;
  private paymentService: MockPaymentService;
  private outputAudioContext: AudioContext;
  private outputNode: GainNode;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private readonly API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  constructor(cartManager: CartManager, storeProfile: StoreProfileModule) {
    super();
    this.cartManager = cartManager;
    this.storeProfile = storeProfile;
    this.paymentService = new MockPaymentService({
      mode: 'alwaysSuccess',
      delayMs: 500, // 빠른 응답을 위해 딜레이 단축
    });

    if (!this.API_KEY) {
      console.error("API Key is missing. Please set VITE_GEMINI_API_KEY in .env");
      throw new Error("API Key is missing");
    }

    this.client = new GoogleGenAI({
      apiKey: this.API_KEY,
    });

    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.outputNode = this.outputAudioContext.createGain();
    this.outputNode.connect(this.outputAudioContext.destination);
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  async connect(mode: ConnectionMode = 'audio', ageGroup?: AgeGroup) {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    const tools: Tool[] = [
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

    // Get menu data from StoreProfileModule
    const menuData = this.storeProfile.getMenuForLLM();

    let speedInstruction = "";
    if (ageGroup === AgeGroup.CHILD || ageGroup === AgeGroup.MIDDLE_AGED || ageGroup === AgeGroup.SENIOR) {
      speedInstruction = "사용자가 어린이, 중장년층 또는 고령자입니다. 목소리 속도를 평소보다 천천히 하고, 매우 또박또박 말하세요. 이해하기 쉬운 단어를 사용하세요.";
    }

    const systemInstruction = {
      parts: [{
        text: `
당신은 햄버거 가게의 친절한 키오스크 직원입니다.
${speedInstruction}

[메뉴 정보]
${JSON.stringify(menuData, null, 2)}

[메뉴 구조 이해]
- 각 메뉴(MenuItem)는 optionGroups를 가질 수 있습니다.
- optionGroups: 해당 메뉴에서 선택 가능한 옵션들 (세트/단품, 사이즈, 음료 등)
- dependsOn: 다른 옵션 선택 시에만 표시되는 조건부 옵션
  예: 음료/사이드 선택은 '세트' 선택 시에만 필요

[주문 흐름]
1. 메뉴 확정 → addToCart 호출 → cartItemId와 pendingOptions(필수 옵션 그룹) 반환
2. pendingOptions의 필수 옵션(required: true)을 순서대로 고객에게 물어보기
3. 각 옵션 선택 → selectOption(cartItemId, groupId, optionId) 호출
4. 의존성 옵션(dependsOn)은 선행 옵션 선택 후에 pendingOptions에 나타남
5. pendingOptions가 없으면 → 추가 주문 여부 확인
6. 주문 완료 → getCart로 장바구니 확인 → 결제 방법 물어보기 → processPayment

[대화 규칙]
1. 사용자가 모호하게 주문하면 구체적인 메뉴를 제안하세요.
2. 메뉴별로 다른 옵션이 있으니 optionGroups를 확인하세요:
   - 버거: set_choice(세트/단품) → (세트 시) drink, side 선택
   - 음료 단품: size(미디엄/라지) 선택
   - 사이드 단품: 옵션 없음 (바로 장바구니에 추가)
3. addToCart 결과의 pendingOptions에 있는 옵션만 물어보세요.
4. 수량 변경 요청 시 updateQuantity, 삭제 요청 시 removeFromCart 사용
5. 한국어로 자연스럽게 대화하세요.
6. 결제 시 processPayment 호출 (method: "CARD" 또는 "MOBILE")

[함수 호출 시 주의]
- addToCart 결과로 받은 cartItemId를 이후 옵션 선택에 반드시 사용
- selectOption 호출 시 groupId와 optionId는 메뉴 정보의 id 값 사용
- 품절(available: false) 메뉴/옵션은 주문 불가 안내
- 옵션 가격이 0보다 크면 고객에게 추가 금액 안내 (예: "치즈스틱은 500원 추가입니다")
        `
      }]
    };

    // 응답은 항상 오디오, outputAudioTranscription으로 텍스트 transcript도 받음
    const responseModalities = [Modality.AUDIO];

    try {
      this.emit('log', `Connecting to Gemini (${mode} mode)...`);
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            console.log("Gemini Connected");
            this.emit('log', `✅ Connected to Gemini (${mode} mode)`);
            this.emit('log', '⚙️ Initial setup sent');

            // Trigger initial greeting
            setTimeout(() => {
              this.sendTextMessage("손님이 왔어. 먼저 인사하고 주문을 받아줘.");
            }, 100);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData;
            if (audio && audio.data) {
              this.playAudioChunk(audio.data);
            }

            // Handle Text - 여러 위치에서 텍스트 찾기
            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.text) {
                console.log("[Gemini Text]", part.text);
                this.emit('log', `🤖 Gemini: ${part.text}`);
                this.emit('text_response', part.text);
              }
            }

            // Handle output transcription (outputAudioTranscription 설정 시)
            const outputTranscription = (message as any).serverContent?.outputTranscription?.text;
            if (outputTranscription) {
              this.emit('log', `🤖 Gemini: ${outputTranscription}`);
              this.emit('text_response', outputTranscription);
            }

            // Handle Function Calls
            const toolCall = message.toolCall;
            if (toolCall) {
              await this.handleToolCall(toolCall);
            }

            // Handle Interruption
            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              this.stopAudio();
            }

            // Handle turnComplete
            const turnComplete = message.serverContent?.turnComplete;
            if (turnComplete) {
              this.emit('turn_complete');
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error("Gemini Error:", e);
            this.emit('log', `❌ Error: ${e.message}`);
          },
          onclose: (e: CloseEvent) => {
            console.log("Gemini Disconnected", e);
            this.emit('log', `🔌 Disconnected: ${e.code} ${e.reason}`);
          },
        },
        config: {
          responseModalities: responseModalities,
          systemInstruction: systemInstruction,
          tools: tools,
          outputAudioTranscription: {}, // 오디오 응답의 텍스트 transcript 받기
        },
      });
    } catch (e) {
      console.error("Connection Failed:", e);
      this.emit('log', `❌ Connection Failed: ${e instanceof Error ? e.message : String(e)} `);
    }
  }

  // Helper to handle tool calls
  private async handleToolCall(toolCall: any) {
    const functionCalls = toolCall.functionCalls;
    const functionResponses = [];

    for (const call of functionCalls) {
      const logMsg = `🛠️ Function Call: ${call.name}(${JSON.stringify(call.args)})`;
      console.log(`[Gemini Request] ${logMsg}`);
      this.emit('log', logMsg);

      let result: CartOperationResult | string | object;

      // 실제 Core 함수 실행
      if (call.name === "addToCart") {
        result = this.cartManager.addToCart(call.args.menuName, call.args.quantity || 1);
      } else if (call.name === "selectOption") {
        result = this.cartManager.selectOption(
          call.args.cartItemId,
          call.args.groupId,
          call.args.optionId
        );
      } else if (call.name === "updateQuantity") {
        result = this.cartManager.updateQuantity(call.args.cartItemId, call.args.quantity);
      } else if (call.name === "removeFromCart") {
        result = this.cartManager.removeCartItem(call.args.cartItemId);
      } else if (call.name === "getCart") {
        result = this.cartManager.getCartSummary();
      } else if (call.name === "processPayment") {
        const cart = this.cartManager.getCart();
        if (cart.length === 0) {
          result = { success: false, message: "장바구니가 비어있습니다. 먼저 메뉴를 추가해주세요." };
        } else {
          const paymentResult = await this.paymentService.requestPayment({
            orderId: this.generateOrderId(),
            orderName: this.generateOrderName(cart),
            amount: this.cartManager.getTotal(),
            method: call.args.method as PaymentMethod,
          });

          if (paymentResult.success) {
            this.cartManager.clearCart();
            result = { success: true, message: `결제가 완료되었습니다. 거래번호: ${paymentResult.transactionId}` };
            this.emit('payment', { success: true, transactionId: paymentResult.transactionId });
          } else {
            result = { success: false, message: `결제에 실패했습니다. 사유: ${paymentResult.failureReason}` };
            this.emit('payment', { success: false, reason: paymentResult.failureReason });
          }
        }
      } else {
        result = { success: false, message: `알 수 없는 함수: ${call.name}` };
      }

      // Tool Call 이벤트 emit (UI에서 사용)
      this.emit('tool_call', {
        name: call.name,
        args: call.args,
        result: result,
      });

      // 결과 패키징
      functionResponses.push({
        id: call.id,
        name: call.name,
        response: { result: result } // 함수의 리턴값을 Gemini에게 전달
      });
    }

    // Send tool response
    if (this.session) {
      console.log("[Client] Sending Tool Response:", functionResponses);
      this.session.sendToolResponse({
        functionResponses: functionResponses
      });
    }
  }

  // Helper to play audio
  private async playAudioChunk(base64Data: string) {
    this.nextStartTime = Math.max(
      this.nextStartTime,
      this.outputAudioContext.currentTime,
    );

    const audioBuffer = await decodeAudioData(
      decode(base64Data),
      this.outputAudioContext,
      24000,
      1,
    );
    const source = this.outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputNode);
    source.addEventListener('ended', () => {
      this.sources.delete(source);
    });

    source.start(this.nextStartTime);
    this.nextStartTime = this.nextStartTime + audioBuffer.duration;
    this.sources.add(source);
  }

  stopAudio() {
    for (const source of this.sources.values()) {
      source.stop();
      this.sources.delete(source);
    }
    this.nextStartTime = 0;
  }

  private generateOrderId(): string {
    return `order_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateOrderName(cart: CartItem[]): string {
    if (cart.length === 0) return '';
    if (cart.length === 1) return cart[0].menuName;
    return `${cart[0].menuName} 외 ${cart.length - 1}건`;
  }

  // Public method to send text message (텍스트 모드용)
  sendTextMessage(text: string): void {
    if (this.session) {
      try {
        this.emit('log', `👤 User: ${text}`);
        this.emit('user_message', text); // 사용자 메시지 이벤트

        // role/parts 형식으로 전송
        this.session.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [{ text: text }]
            }
          ],
          turnComplete: true,
        });
      } catch (error) {
        console.error("Failed to send text message:", error);
        this.emit('log', `❌ Failed to send: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      this.emit('log', '❌ Session not connected');
    }
  }

  // Public method to send audio from microphone
  sendAudioChunk(base64Audio: string) {
    if (this.session) {
      try {
        this.session.sendRealtimeInput({
          media: {
            mimeType: "audio/pcm;rate=16000", // Assuming 16kHz PCM from microphone
            data: base64Audio
          }
        });
      } catch (error) {
        // Ignore errors if socket is closed, just log debug
        console.debug("Failed to send audio chunk:", error);
      }
    }
  }

  // Public method to disconnect from Gemini
  disconnect() {
    if (this.session) {
      this.emit('log', '🔌 Disconnecting from Gemini...');
      this.session.close();
      this.session = null;
      this.stopAudio();
      this.emit('log', '✅ Disconnected successfully');
    }
  }
}
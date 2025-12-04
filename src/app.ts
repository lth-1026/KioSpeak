/**
 * KioSpeak Application Entry Point
 */

async function main() {
  console.log('🎤 KioSpeak Starting...');

  const app = document.getElementById('app');
  if (!app) {
    throw new Error('App container not found');
  }

  // Initial UI Rendering
  app.innerHTML = `
    <div style="padding: 2rem; max-width: 800px; margin: 0 auto; text-align: center;">
      <h1 style="margin-bottom: 1rem;">KioSpeak - AI Kiosk Assistant</h1>
      <div id="status-area" style="margin: 2rem 0; padding: 1rem; background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <p style="color: #666; margin-bottom: 1rem;">Select a module to test</p>
        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
          <a href="/test-llm.html" style="
            background: #0066cc;
            color: white;
            border: none;
            padding: 1rem 2rem;
            font-size: 1.2rem;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
            text-decoration: none;
            display: inline-block;
          ">🎤 Test LLM (Realtime)</a>
          <a href="/test-vision.html" style="
            background: #4CAF50;
            color: white;
            border: none;
            padding: 1rem 2rem;
            font-size: 1.2rem;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
            text-decoration: none;
            display: inline-block;
          ">👁️ Test Vision</a>
          <a href="/test-integration.html" style="
            background: #9C27B0;
            color: white;
            border: none;
            padding: 1rem 2rem;
            font-size: 1.2rem;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
            text-decoration: none;
            display: inline-block;
          ">🚀 Test Integration</a>
        </div>
      </div>
      
      <div style="margin-top: 2rem; padding: 1rem; background: #f9f9f9; border-radius: 8px; text-align: left;">
        <h3 style="margin-bottom: 0.5rem;">Available Modules:</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 0.5rem 0; border-bottom: 1px solid #eee;">
            <strong>🎤 LLM Test:</strong> Realtime voice interaction with Gemini
          </li>
          <li style="padding: 0.5rem 0;">
            <strong>👁️ Vision Test:</strong> Face detection and age estimation
          </li>
        </ul>
      </div>
    </div>
  `;
}

main().catch(console.error);

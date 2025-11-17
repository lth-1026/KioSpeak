/**
 * KioSpeak Application Entry Point
 */

async function main() {
  console.log('🎤 KioSpeak Starting...');

  const app = document.getElementById('app');
  if (!app) {
    throw new Error('App container not found');
  }

  // TODO: Implement main application UI
  app.innerHTML = `
    <div style="padding: 2rem; max-width: 800px; margin: 0 auto;">
      <h1 style="margin-bottom: 1rem;">KioSpeak - AI Kiosk Assistant</h1>
      <p style="color: #666;">Main application coming soon...</p>
      <p style="margin-top: 1rem;">
        <a href="/test-vision.html" style="color: #0066cc;">→ Test Vision Module</a>
      </p>
    </div>
  `;
}

main().catch(console.error);

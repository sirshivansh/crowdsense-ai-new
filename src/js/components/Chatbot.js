import { simulator } from '../data/simulation.js';

export class Chatbot {
  constructor() {
    this.fab = document.getElementById('open-chat');
    this.window = document.getElementById('chat-window');
    this.closeBtn = document.getElementById('close-chat');
    this.messagesContainer = document.getElementById('chat-messages');
    this.input = document.getElementById('chat-input-field');
    this.sendBtn = document.getElementById('send-chat-btn');

    this.bindEvents();
  }

  bindEvents() {
    this.fab.addEventListener('click', () => {
      this.window.classList.remove('hidden');
      this.fab.classList.add('hidden');
    });

    this.closeBtn.addEventListener('click', () => {
      this.window.classList.add('hidden');
      this.fab.classList.remove('hidden');
    });

    this.sendBtn.addEventListener('click', () => this.handleSend());
    this.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSend();
    });
  }

  handleSend() {
    const text = this.input.value.trim();
    if (!text) return;

    this.addMessage(text, 'user');
    this.input.value = '';

    // Simulate AI typing delay
    setTimeout(() => {
      const response = this.getMockResponse(text);
      this.addMessage(response, 'ai');
    }, 800 + Math.random() * 1000);
  }

  addMessage(text, sender) {
    const el = document.createElement('div');
    el.className = `message ${sender}`;
    el.textContent = text;
    this.messagesContainer.appendChild(el);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  getMockResponse(query) {
    const lower = query.toLowerCase();
    const state = simulator.state;
    
    // Check lowest wait time food
    if (lower.includes('food') || lower.includes('lowest wait') || lower.includes('eat')) {
      const bestWait = [...state.waitTimes].sort((a,b) => a.time - b.time)[0];
      return `Right now, ${bestWait.name} has the lowest wait time at just ${bestWait.time} minutes!`;
    }
    
    // Check avoidance
    if (lower.includes('avoid') || lower.includes('crowd') || lower.includes('empty')) {
      const bestZone = [...state.zones].sort((a,b) => a.density - b.density)[0];
      const worstZone = [...state.zones].sort((a,b) => b.density - a.density)[0];
      return `Try to head towards ${bestZone.name}, it's currently the least congested area. Avoid ${worstZone.name} as it's packed!`;
    }

    if (lower.includes('restroom')) {
      const restroom = state.waitTimes.find(w => w.id === 'rest');
      return `The North Restroom currently has a ${restroom.time} min wait. I can suggest a route if you like!`;
    }
    
    return "I'm analyzing the real-time crowd data... Use the map to check densities, or ask me about the lowest wait times and which areas to avoid!";
  }
}

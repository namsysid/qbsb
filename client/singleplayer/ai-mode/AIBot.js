import Player from '../../../quizbowl/Player.js';

export default class AIBot {
  constructor (room, name = 'ai-bot') {
    this.room = room;
    this.player = new Player(name);
    this.player.username = name;
    this.socket = {
      send: this.onmessage.bind(this),
      sendToServer: (message) => room.message(name, message)
    };
    this.active = true;

    this.tossup = {};
    this.wordIndex = 0;
    this.buzzpoint = Number.POSITIVE_INFINITY;
    this.correctBuzz = false;
    this.hasBuzzed = false;
  }

  onmessage (message) {
    const data = JSON.parse(message);
    switch (data.type) {
      case 'start':
      case 'skip':
      case 'next': return this.next(data);

      case 'update-question': return this.updateQuestion(data);
      case 'question': return this.captureQuestion(data);
    }
  }

  get active () {
    return this._active;
  }

  set active (value) {
    this._active = value;
    if (this._active) {
      this.room.players[this.player.userId] = this.player;
      this.room.sockets[this.player.userId] = this.socket;
    } else {
      this.room.leave(this.player.userId);
    }
  }

  sendBuzz ({ correct }) {
    if (!this.active) { return; }
    // need to wait 50ms before each action
    // otherwise the server will not process things correctly
    this.hasBuzzed = true;
    setTimeout(
      () => {
        this.socket.sendToServer({ type: 'buzz' });
        setTimeout(
          () => this.socket.sendToServer({ type: 'give-answer', givenAnswer: correct ? this.tossup.answer_sanitized : '' }),
          1000
        );
      }, 50
    );
  }

  /**
   * Calculate when to buzz
   * @returns {{buzzpoint: number, correctBuzz: boolean}}
   */
  calculateBuzzpoint ({ packetLength, oldTossup, tossup }) {
    throw new Error('calculateBuzzpoint not implemented');
  }

  captureQuestion ({ question }) {
    if (!question) return;
    this.prepareBuzzpoint({ tossup: question });
  }

  next ({ packetLength, oldTossup, tossup }) {
    this.prepareBuzzpoint({ packetLength, oldTossup, tossup });
  }

  prepareBuzzpoint ({ packetLength, oldTossup, tossup }) {
    this.tossup = tossup || this.tossup;
    this.wordIndex = 0;
    this.hasBuzzed = false;
    const result = this.calculateBuzzpoint({ packetLength, oldTossup, tossup: this.tossup });
    if (result && typeof result.then === 'function') {
      this.buzzpoint = Number.POSITIVE_INFINITY;
      this.correctBuzz = false;
      result
        .then(({ buzzpoint, correctBuzz }) => {
          this.buzzpoint = Number.isFinite(buzzpoint) ? Math.max(1, Math.floor(buzzpoint)) : Number.POSITIVE_INFINITY;
          this.correctBuzz = !!correctBuzz;
          if (!this.hasBuzzed && this.wordIndex >= this.buzzpoint && Number.isFinite(this.buzzpoint)) {
            this.sendBuzz({ correct: this.correctBuzz });
          }
        })
        .catch((err) => console.warn('AIBot.calculateBuzzpoint failed', err));
    } else {
      ({ buzzpoint: this.buzzpoint, correctBuzz: this.correctBuzz } = result || {});
      this.buzzpoint = Number.isFinite(this.buzzpoint) ? Math.max(1, Math.floor(this.buzzpoint)) : Number.POSITIVE_INFINITY;
      this.correctBuzz = !!this.correctBuzz;
    }
  }

  /**
   *
   * @param {({ packetLength, oldTossup, tossup }) => {buzzpoint: number, correctBuzz: boolean}} calculateBuzzpointFunction
   */
  setAIBot (calculateBuzzpointFunction) {
    this.calculateBuzzpoint = calculateBuzzpointFunction;
  }

  updateQuestion ({ word }) {
    this.wordIndex++;
    if (!this.hasBuzzed && Number.isFinite(this.buzzpoint) && this.wordIndex >= this.buzzpoint) {
      return this.sendBuzz({ correct: this.correctBuzz });
    }
  }
}

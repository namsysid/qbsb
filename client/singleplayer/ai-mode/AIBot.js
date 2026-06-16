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
    this.wrongAnswerProfile = 'beginner';
    console.debug('[AI-BUZZ][bot] prepareBuzzpoint', { id: this.tossup?._id, active: this.active });
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
    if (this.tossup?.isTossup !== true) {
      console.debug('[AI-BUZZ][bot] skip buzz for non-tossup question', { isTossup: this.tossup?.isTossup, questionId: this.tossup?._id });
      return;
    }
    // need to wait 50ms before each action
    // otherwise the server will not process things correctly
    this.hasBuzzed = true;
    const answer = correct ? this.getAiAnswer() : this.getAiWrongAnswer();
    console.debug('[AI-BUZZ][bot] sendBuzz', { correct, buzzpoint: this.buzzpoint, wordIndex: this.wordIndex, answer });
    setTimeout(() => {
      this.socket.sendToServer({ type: 'buzz' });
      this.socket.sendToServer({ type: 'give-answer', givenAnswer: answer });
    }, 50);
  }

  getAiAnswer () {
    const raw = typeof this.tossup?.answer === 'string'
      ? this.tossup.answer
      : (typeof this.tossup?.answer_sanitized === 'string' ? this.tossup.answer_sanitized : '');
    if (!raw) return '';
    const match = raw.match(/^([A-Z])\)\s*/);
    if (match) return match[1];
    return raw;
  }

  getAnswerlineRaw () {
    const raw = typeof this.tossup?.answer === 'string'
      ? this.tossup.answer
      : (typeof this.tossup?.answer_sanitized === 'string' ? this.tossup.answer_sanitized : '');
    return raw || '';
  }

  getQuestionTextRaw () {
    if (typeof this.tossup?.question_sanitized === 'string' && this.tossup.question_sanitized.trim()) {
      return this.tossup.question_sanitized;
    }
    if (typeof this.tossup?.question === 'string' && this.tossup.question.trim()) {
      return this.tossup.question;
    }
    if (typeof this.tossup?.question_text === 'string' && this.tossup.question_text.trim()) {
      return this.tossup.question_text;
    }
    return '';
  }

  getAiWrongAnswer () {
    if (this.tossup?.is_mcq === true) {
      return this.getAiWrongMcqAnswer();
    }
    return this.getAiWrongShortAnswer();
  }

  getAiWrongMcqAnswer () {
    const raw = this.getAnswerlineRaw();
    const correctMatch = raw.match(/^([A-Z])\)\s*/i);
    const correctLetter = correctMatch ? correctMatch[1].toUpperCase() : null;
    const optionCount = Array.isArray(this.tossup?.options) && this.tossup.options.length > 0
      ? this.tossup.options.length
      : 4;
    const letters = Array.from({ length: Math.max(2, optionCount) }, (_, i) => String.fromCharCode(65 + i));
    const wrongLetters = letters.filter((letter) => letter !== correctLetter);
    if (wrongLetters.length === 0) { return ''; }
    const index = Math.floor(Math.random() * wrongLetters.length);
    return wrongLetters[index];
  }

  getAiWrongShortAnswer () {
    if (this.wrongAnswerProfile === 'beginner') {
      return '';
    }

    if (this.wrongAnswerProfile === 'intermediate') {
      const questionText = this.getQuestionTextRaw();
      const numbersInQuestion = questionText.match(/-?\d+(?:\.\d+)?/g);
      if (Array.isArray(numbersInQuestion) && numbersInQuestion.length > 0) {
        const index = Math.floor(Math.random() * numbersInQuestion.length);
        return numbersInQuestion[index];
      }
      return '';
    }

    if (this.wrongAnswerProfile === 'advanced') {
      const rawAnswer = this.getAnswerlineRaw();
      const numericMatch = rawAnswer.match(/-?\d+(?:\.\d+)?/);
      if (!numericMatch) { return ''; }
      const value = Number.parseFloat(numericMatch[0]);
      if (!Number.isFinite(value)) { return ''; }

      const operations = [
        (n) => n + 1,
        (n) => n - 1,
        (n) => n * 2,
        (n) => (n === 0 ? 1 : n / 2)
      ];
      const opIndex = Math.floor(Math.random() * operations.length);
      const transformed = operations[opIndex](value);
      if (!Number.isFinite(transformed)) { return ''; }
      const rounded = Number.isInteger(value)
        ? Math.round(transformed)
        : Number.parseFloat(transformed.toFixed(3));
      return String(rounded);
    }

    return '';
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
    console.debug('[AI-BUZZ][bot] captureQuestion', { id: question?._id ?? question?.id ?? question?.questionId });
    this.prepareBuzzpoint({ tossup: question });
  }

  next ({ packetLength, oldTossup, tossup }) {
    console.debug('[AI-BUZZ][bot] next', { packetLength, oldId: oldTossup?._id, newId: tossup?._id });
    this.prepareBuzzpoint({ packetLength, oldTossup, tossup });
  }

  prepareBuzzpoint ({ packetLength, oldTossup, tossup }) {
    this.tossup = tossup || this.tossup;
    this.wordIndex = 0;
    this.hasBuzzed = false;
    console.debug('[AI-BUZZ][bot] prepareBuzzpoint', { id: this.tossup?._id, active: this.active });
    const result = this.calculateBuzzpoint({ packetLength, oldTossup, tossup: this.tossup });
    if (result && typeof result.then === 'function') {
      this.buzzpoint = Number.POSITIVE_INFINITY;
      this.correctBuzz = false;
      result
        .then(({ buzzpoint, correctBuzz }) => {
          this.buzzpoint = Number.isFinite(buzzpoint) ? Math.max(1, Math.floor(buzzpoint)) : Number.POSITIVE_INFINITY;
          this.correctBuzz = !!correctBuzz;
          console.debug('[AI-BUZZ][bot] resolved', { buzzpoint: this.buzzpoint, correctBuzz: this.correctBuzz });
          if (!this.hasBuzzed && this.wordIndex >= this.buzzpoint && Number.isFinite(this.buzzpoint)) {
            this.sendBuzz({ correct: this.correctBuzz });
          }
        })
        .catch((err) => console.warn('AIBot.calculateBuzzpoint failed', err));
    } else {
      ({ buzzpoint: this.buzzpoint, correctBuzz: this.correctBuzz } = result || {});
      this.buzzpoint = Number.isFinite(this.buzzpoint) ? Math.max(1, Math.floor(this.buzzpoint)) : Number.POSITIVE_INFINITY;
      this.correctBuzz = !!this.correctBuzz;
      console.debug('[AI-BUZZ][bot] sync', { buzzpoint: this.buzzpoint, correctBuzz: this.correctBuzz });
    }
  }

  /**
   *
   * @param {({ packetLength, oldTossup, tossup }) => {buzzpoint: number, correctBuzz: boolean}} calculateBuzzpointFunction
   */
  setAIBot (calculateBuzzpointFunction) {
    this.calculateBuzzpoint = calculateBuzzpointFunction;
  }

  setWrongAnswerProfile (profile) {
    if (profile === 'beginner' || profile === 'intermediate' || profile === 'advanced') {
      this.wrongAnswerProfile = profile;
      return;
    }
    this.wrongAnswerProfile = 'beginner';
  }

  updateQuestion ({ word }) {
    this.wordIndex++;
    console.debug('[AI-BUZZ][bot] updateQuestion', { wordIndex: this.wordIndex, buzzpoint: this.buzzpoint, word });
    if (!this.hasBuzzed && Number.isFinite(this.buzzpoint) && this.wordIndex >= this.buzzpoint) {
      return this.sendBuzz({ correct: this.correctBuzz });
    }
  }
}

import { SBCATEGORIES } from '../../quizbowl/categories.js';
import QuestionRoom from '../../quizbowl/QuestionRoom.js';
import ScienceBowlCategoryManager from '../../quizbowl/ScienceBowlCategoryManager.js';

export default class ScienceBowlRoom extends QuestionRoom {
  constructor(name = 'science-bowl', subjects = SBCATEGORIES) {
    super(name);

    this.settings = {
      ...this.settings,
      skip: true,
      showHistory: true,
      typeToAnswer: true,
      timer: true,
      strictness: 7,
      readingSpeed: 50
    };

    this.query = {
      subjects,
      competitions: [],
      years: [],
      isMcq: undefined,
      isTossup: undefined,
      maxReturnLength: 50,
      randomize: true,
      caseSensitive: false
    };

    this.mode = 'random';
    this.previous = {
      celerity: 0,
      endOfQuestion: false,
      inPower: false,
      isCorrect: false,
      tossup: null,
      userId: null,
      powerValue: 0,
      negValue: -5
    };

    // Use the science bowl specific category manager
    this.categoryManager = new ScienceBowlCategoryManager(subjects);
  }

  async message(userId, message) {
    switch (message.type) {
      case 'toggle-show-history': return this.toggleShowHistory(userId, message);
      case 'toggle-timer': return this.toggleTimer(userId, message);
      case 'toggle-type-to-answer': return this.toggleTypeToAnswer(userId, message);
      case 'toggle-rebuzz': return this.toggleRebuzz(userId, message);
      case 'set-strictness': return this.setStrictness(userId, message);
      case 'set-reading-speed': return this.setReadingSpeed(userId, message);
      case 'set-subjects': return this.setSubjects(userId, message);
      default: super.message(userId, message);
    }
  }

  toggleShowHistory(userId, { showHistory }) {
    this.settings.showHistory = showHistory;
    this.emitMessage({ type: 'toggle-show-history', showHistory, userId });
  }

  toggleTimer(userId, { timer }) {
    this.settings.timer = timer;
    this.emitMessage({ type: 'toggle-timer', timer, userId });
  }

  toggleTypeToAnswer(userId, { typeToAnswer }) {
    this.settings.typeToAnswer = typeToAnswer;
    this.emitMessage({ type: 'toggle-type-to-answer', typeToAnswer, userId });
  }

  toggleRebuzz(userId, { rebuzz }) {
    this.settings.rebuzz = rebuzz;
    this.emitMessage({ type: 'toggle-rebuzz', rebuzz, userId });
  }

  setStrictness(userId, { strictness }) {
    this.settings.strictness = strictness;
    this.emitMessage({ type: 'set-strictness', strictness, userId });
  }

  setReadingSpeed(userId, { readingSpeed }) {
    this.settings.readingSpeed = readingSpeed;
    this.emitMessage({ type: 'set-reading-speed', readingSpeed, userId });
  }

  setSubjects(userId, { subjects }) {
    this.query.subjects = subjects;
    this.emitMessage({ type: 'set-subjects', subjects, userId });
  }
} 
import { SBCATEGORIES } from '../../quizbowl/categories.js';
import QuestionRoom from '../../quizbowl/QuestionRoom.js';
import ScienceBowlCategoryManager from '../../quizbowl/ScienceBowlCategoryManager.js';
import { validateAnswer } from './science-bowl/answer-validator.js';

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

    this.mode = 'random questions';
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

    // Initialize pause-related state
    this.timeoutID = null;
    this.paused = false;
    this.questionSplit = [];
    this.wordIndex = 0;
    this.tossupProgress = 'NOT_STARTED';
  }

  async message(userId, message) {
    console.log('ScienceBowlRoom: Received message:', message);
    switch (message.type) {
      case 'start':
        console.log('ScienceBowlRoom: Handling start message');
        return this.next(userId, { type: 'start' });
      case 'next':
        console.log('ScienceBowlRoom: Handling next message');
        return this.next(userId, { type: 'next' });
      case 'pause':
        console.log('ScienceBowlRoom: Handling pause message');
        return this.pause(userId);
      case 'buzz':
        console.log('ScienceBowlRoom: Handling buzz message');
        return this.buzz(userId);
      case 'give-answer':
        console.log('ScienceBowlRoom: Handling give-answer message');
        return this.giveAnswer(userId, message);
      case 'toggle-show-history': return this.toggleShowHistory(userId, message);
      case 'toggle-timer': return this.toggleTimer(userId, message);
      case 'toggle-type-to-answer': return this.toggleTypeToAnswer(userId, message);
      case 'toggle-rebuzz': return this.toggleRebuzz(userId, message);
      case 'set-strictness': return this.setStrictness(userId, message);
      case 'set-reading-speed': return this.setReadingSpeed(userId, message);
      case 'set-subjects': return this.setSubjects(userId, message);
      default:
        console.log('ScienceBowlRoom: Forwarding to parent class');
        return super.message(userId, message);
    }
  }

  async next(userId, { type }) {
    console.log('ScienceBowlRoom: next() called with type:', type);
    
    // Check if we can advance
    if (this.buzzedIn) {
      console.log('Cannot advance - someone has buzzed in');
      return false;
    }
    if (this.queryingQuestion) {
      console.log('Cannot advance - already querying question');
      return false;
    }
    if (this.tossupProgress === 'READING' && !this.settings.skip) {
      console.log('Cannot advance - question is reading and skip is disabled');
      return false;
    }

    // Clear any running timers
    clearTimeout(this.timeoutID);
    clearInterval(this.timer?.interval);
    this.emitMessage({ type: 'timer-update', timeRemaining: 0 });

    console.log('ScienceBowlRoom: next() called');
    const question = await this.advanceQuestion();
    console.log('ScienceBowlRoom: advanceQuestion returned:', question);
    
    if (question === null) {
      console.log('ScienceBowlRoom: No question found');
      this.emitMessage({ type: 'no-questions-found' });
      return;
    }

    // Reset previous question text
    this.emitMessage({ type: 'reset-question' });

    // Split question into words for reading
    this.questionSplit = question.question_text.split(' ').filter(word => word !== '');
    this.wordIndex = 0;
    this.tossupProgress = 'READING';

    // For Science Bowl questions, isTossup is already a boolean field
    // No need to convert from type enum
    console.log('ScienceBowlRoom: Question type:', { isTossup: question.isTossup });

    console.log('ScienceBowlRoom: Emitting question:', question);
    this.tossup = question;
    this.emitMessage({ type: 'question', question });
    
    // Start reading the question
    this.readQuestion(Date.now());
    return question;
  }

  async readQuestion(expectedReadTime) {
    if (!this.questionSplit || this.wordIndex >= this.questionSplit.length) {
      // Start timer when question finishes reading
      if (!this.buzzedIn) {
        // Use 20 seconds for bonuses, 5 seconds for tossups
        const timerDuration = this.tossup?.isTossup ? 50 : 200; // 5 seconds for tossups, 20 seconds for bonuses
        this.startServerTimer(
          timerDuration,
          (time) => {
            // Ensure timer doesn't get stuck at 0.1
            if (time <= 0) {
              clearInterval(this.timer?.interval);
              this.emitMessage({ type: 'timer-update', timeRemaining: 0 });
              this.revealQuestion();
              return;
            }
            this.emitMessage({ type: 'timer-update', timeRemaining: time });
          },
          () => {
            // When timer expires, reveal the question and answer
            this.tossupProgress = 'ANSWER_REVEALED';
            this.emitMessage({
              type: 'reveal-answer',
              question: this.questionSplit.join(' '),
              answer: '',
              correctAnswer: this.tossup?.answer
            });
          }
        );
      }
      return;
    }

    // If someone has buzzed in, stop reading
    if (this.buzzedIn) {
      console.log('ScienceBowlRoom: Someone buzzed in, stopping question reading');
      return;
    }

    const word = this.questionSplit[this.wordIndex];
    this.wordIndex++;

    // Special handling for multiple-choice questions
    if (this.tossup?.is_mcq && this.tossup?.options) {
      // If we've reached the end of the question text, display options
      if (this.wordIndex >= this.questionSplit.length) {
        // Emit the question text first
        this.emitMessage({ type: 'update-question', word });
        
        // Add a small delay before showing options
        this.optionTimeout0 = setTimeout(() => {
          // If someone has buzzed in during the delay, don't show options
          if (this.buzzedIn) {
            console.log('ScienceBowlRoom: Someone buzzed in during delay, stopping options reading');
            return;
          }

          // Emit each option with a delay
          this.tossup.options.forEach((option, index) => {
            this[`optionTimeout${index + 1}`] = setTimeout(() => {
              // If someone has buzzed in during option reading, stop
              if (this.buzzedIn) {
                console.log('ScienceBowlRoom: Someone buzzed in during option reading, stopping');
                return;
              }

              this.emitMessage({ 
                type: 'update-question', 
                word: `\n${option}` 
              });
              
              // If this is the last option, start the timer
              if (index === this.tossup.options.length - 1) {
                this.optionTimeoutFinal = setTimeout(() => {
                  if (!this.buzzedIn) {
                    const timerDuration = this.tossup?.isTossup ? 50 : 200;
                    this.startServerTimer(
                      timerDuration,
                      (time) => {
                        if (time <= 0) {
                          clearInterval(this.timer?.interval);
                          this.emitMessage({ type: 'timer-update', timeRemaining: 0 });
                          this.revealQuestion();
                          return;
                        }
                        this.emitMessage({ type: 'timer-update', timeRemaining: time });
                      },
                      () => {
                        this.tossupProgress = 'ANSWER_REVEALED';
                        this.emitMessage({
                          type: 'reveal-answer',
                          question: this.questionSplit.join(' '),
                          answer: '',
                          correctAnswer: this.tossup?.answer
                        });
                      }
                    );
                  }
                }, 1000); // Wait 1 second after the last option before starting timer
              }
            }, index * 1000); // 1 second delay between options
          });
        }, 1000);
        return;
      }
    }

    this.emitMessage({ type: 'update-question', word });

    // Calculate time needed before reading next word
    let time = Math.log(word.length) + 1;
    if (word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) {
      time += 2;
    } else if (word.endsWith(',')) {
      time += 0.75;
    }

    time = time * 0.9 * (125 - this.settings.readingSpeed);
    const delay = time - Date.now() + expectedReadTime;

    this.timeoutID = setTimeout(() => {
      if (!this.paused && !this.buzzedIn) {
        this.readQuestion(time + expectedReadTime);
      }
    }, delay);
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

  pause(userId) {
    console.log('ScienceBowlRoom: pause() called');
    if (this.buzzedIn) { 
      console.log('ScienceBowlRoom: Cannot pause - someone has buzzed in');
      return false; 
    }
    if (this.tossupProgress === 'ANSWER_REVEALED') { 
      console.log('ScienceBowlRoom: Cannot pause - answer is already revealed');
      return false; 
    }

    this.paused = !this.paused;
    console.log('ScienceBowlRoom: Pause state set to:', this.paused);
    
    if (this.paused) {
      console.log('ScienceBowlRoom: Pausing - clearing timers');
      clearTimeout(this.timeoutID);
      clearInterval(this.timer?.interval);
    } else if (this.wordIndex >= this.questionSplit.length) {
      console.log('ScienceBowlRoom: Resuming - revealing question');
      this.revealQuestion();
    } else {
      console.log('ScienceBowlRoom: Resuming - continuing question reading');
      this.readQuestion(Date.now());
    }
    
    this.emitMessage({ type: 'pause', paused: this.paused });
    return true;
  }

  buzz(userId) {
    console.log('ScienceBowlRoom: buzz() called');
    if (!this.settings.rebuzz && this.buzzes?.includes(userId)) { 
      console.log('ScienceBowlRoom: User already buzzed in');
      return; 
    }
    if (this.tossupProgress !== 'READING') { 
      console.log('ScienceBowlRoom: Question not in reading state');
      return; 
    }

    const username = this.players[userId].username;
    if (this.buzzedIn) {
      console.log('ScienceBowlRoom: Someone already buzzed in');
      this.emitMessage({ type: 'lost-buzzer-race', userId, username });
      return;
    }

    // Stop question reading
    clearTimeout(this.timeoutID);
    this.buzzedIn = userId;
    this.buzzes = this.buzzes || [];
    this.buzzes.push(userId);
    this.paused = false;

    console.log('ScienceBowlRoom: Emitting buzz message');
    this.emitMessage({ type: 'buzz', userId, username });
    this.emitMessage({ type: 'update-question', word: '(#)' });

    // Start 7-second answer timer
    this.startServerTimer(
      70, // 7 seconds for answer
      (time) => this.emitMessage({ type: 'timer-update', timeRemaining: time }),
      () => this.giveAnswer(userId, { givenAnswer: '' })
    );
  }

  giveAnswer(userId, { givenAnswer }) {
    console.log('ScienceBowlRoom: giveAnswer() called with answer:', givenAnswer);
    if (typeof givenAnswer !== 'string') { 
      console.log('ScienceBowlRoom: Invalid answer format');
      return false; 
    }
    if (this.buzzedIn !== userId) { 
      console.log('ScienceBowlRoom: User not buzzed in');
      return false; 
    }

    // Clear any existing timers
    clearTimeout(this.timeoutID);
    clearInterval(this.timer?.interval);
    this.emitMessage({ type: 'timer-update', timeRemaining: 0 });

    // Reset buzzed in state and stop reading
    this.buzzedIn = null;
    this.tossupProgress = 'ANSWER_REVEALED';
    
    // Clear any pending option reading timeouts
    if (this.tossup?.is_mcq && this.tossup?.options) {
      // Clear all pending timeouts for options
      clearTimeout(this.optionTimeout0);
      for (let i = 0; i < this.tossup.options.length; i++) {
        clearTimeout(this[`optionTimeout${i + 1}`]);
      }
      clearTimeout(this.optionTimeoutFinal);
    }

    // For multiple-choice questions, check both the letter and full answer
    let isCorrect = false;
    if (this.tossup?.is_mcq && this.tossup?.answer) {
      console.log('Processing MCQ answer:', {
        givenAnswer,
        correctAnswer: this.tossup.answer,
        isMcq: this.tossup.is_mcq
      });
      
      // Extract the letter and full answer from the answer line
      const answerMatch = this.tossup.answer.match(/^([A-Z])\)\s*(.+)$/);
      console.log('Answer match result:', answerMatch);
      
      if (answerMatch) {
        const [, letter, fullAnswer] = answerMatch;
        console.log('Extracted answer parts:', { letter, fullAnswer });
        
        // Create a combined answer string with both letter and full answer
        const combinedAnswer = `${letter} (ACCEPT: ${fullAnswer})`;
        
        // Use the validateAnswer function to check the answer
        const validationResult = validateAnswer(givenAnswer, combinedAnswer, this.settings.strictness);
        isCorrect = validationResult.isCorrect;
        console.log('Final isCorrect result (MCQ):', isCorrect);
      }
    } else if (this.tossup?.answer) {
      console.log('Processing free-response answer:', {
        givenAnswer,
        correctAnswer: this.tossup.answer
      });
      const validationResult = validateAnswer(givenAnswer, this.tossup.answer, this.settings.strictness);
      isCorrect = validationResult.isCorrect;
      console.log('Final isCorrect result (free-response):', isCorrect, validationResult);
    }

    // Store the result in previous
    this.previous = {
      ...this.previous,
      isCorrect,
      tossup: this.tossup,
      userId
    };

    // Emit the answer with directive
    this.emitMessage({
      type: 'reveal-answer',
      question: this.questionSplit.join(' '),
      answer: givenAnswer,
      correctAnswer: this.tossup?.answer,
      isCorrect,
      directive: isCorrect ? 'accept' : 'reject'
    });

    // Also emit give-answer message with isCorrect
    this.emitMessage({
      type: 'give-answer',
      directive: isCorrect ? 'accept' : 'reject',
      isCorrect,
      tossup: this.tossup,
      userId
    });

    return true;
  }
} 

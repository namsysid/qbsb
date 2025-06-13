console.log('Science Bowl script loaded');

import api from '../../scripts/api/index.js';
import questionStats from '../../scripts/auth/question-stats.js';
import audio from '../../audio/index.js';
import { MODE_ENUM } from '../../../quizbowl/constants.js';
import Player from '../../../quizbowl/Player.js';
import ClientScienceBowlRoom from '../ClientScienceBowlRoom.js';
import { arrayToRange, rangeToArray } from '../../scripts/utilities/ranges.js';
import createTossupGameCard from '../../scripts/utilities/tossup-game-card.js';
import { getDropdownValues } from '../../scripts/utilities/dropdown-checklist.js';
import ScienceBowlCategoryModal from '../../scripts/components/ScienceBowlCategoryModal.min.js';
import DifficultyDropdown from '../../scripts/components/DifficultyDropdown.min.js';
import upsertPlayerItem from '../../scripts/upsertPlayerItem.js';
import aiBots from '../ai-mode/ai-bots.js';
import AIBot from '../ai-mode/AIBot.js';
import { SBCATEGORIES } from '../../../quizbowl/categories.js';
import ScienceBowlCategoryManager from '../../../quizbowl/ScienceBowlCategoryManager.js';

let maxPacketNumber = 24;

const modeVersion = '2025-01-14';
const queryVersion = '2025-05-07';
const settingsVersion = '2024-10-16';
const USER_ID = 'user';
const USERNAME = 'user';
const VERSION = '2025-05-07';

const room = new ClientScienceBowlRoom();
window.room = room; // Make room globally available
room.players[USER_ID] = new Player(USER_ID);
room.categoryManager = new ScienceBowlCategoryManager();

// Load saved category state
const savedCategoryState = JSON.parse(window.localStorage.getItem('singleplayer-science-bowl-categories') || '{}');
console.log('Loading saved category state:', savedCategoryState);
if (savedCategoryState.version === queryVersion) {
  room.categoryManager.import(savedCategoryState);
  room.query.subjects = room.categoryManager.categories;
  // Update checkbox states immediately after loading saved state
  console.log('Updating checkbox states after loading saved state');
  document.querySelectorAll('.category-checkbox').forEach(checkbox => {
    checkbox.checked = room.categoryManager.categories.includes(checkbox.id);
  });
}

const aiBot = new AIBot(room);
aiBot.setAIBot(aiBots['average-high-school'][0]);
aiBot.active = false;

const socket = {
  send: onmessage,
  sendToServer: (message) => room.message(USER_ID, message)
};
room.sockets[USER_ID] = socket;

function onmessage (message) {
  const data = JSON.parse(message);
  switch (data.type) {
    case 'alert': return window.alert(data.message);
    case 'buzz': return buzz(data);
    case 'clear-stats': return clearStats(data);
    case 'end': return next(data);
    case 'end-of-set': return endOfSet(data);
    case 'give-answer': return giveAnswer(data);
    case 'next': return next(data);
    case 'no-questions-found': return noQuestionsFound(data);
    case 'pause': return pause(data);
    case 'reveal-answer': return revealAnswer(data);
    case 'reset-question': return document.getElementById('question').textContent = '';
    case 'set-categories': return setCategories(data);
    case 'set-difficulties': return setDifficulties(data);
    case 'set-mode': return setMode(data);
    case 'set-reading-speed': return setReadingSpeed(data);
    case 'set-strictness': return setStrictness(data);
    case 'set-packet-numbers': return setPacketNumbers(data);
    case 'set-set-name': return setSetName(data);
    case 'set-year-range': return setYearRange(data);
    case 'skip': return next(data);
    case 'start': return next(data);
    case 'timer-update': return updateTimerDisplay(data.timeRemaining);
    case 'toggle-ai-mode': return toggleAiMode(data);
    case 'toggle-correct': return toggleCorrect(data);
    case 'toggle-powermark-only': return togglePowermarkOnly(data);
    case 'toggle-rebuzz': return toggleRebuzz(data);
    case 'toggle-show-history': return toggleShowHistory(data);
    case 'toggle-standard-only': return toggleStandardOnly(data);
    case 'toggle-timer': return toggleTimer(data);
    case 'toggle-type-to-answer': return toggleTypeToAnswer(data);
    case 'update-question': return updateQuestion(data);
  }
}

function buzz ({ timer, userId, username }) {
  if (audio.soundEffects) { audio.buzz.play(); }
  if (userId !== USER_ID) { return; }

  document.getElementById('pause').disabled = true;
  const typeToAnswer = document.getElementById('type-to-answer').checked;
  if (typeToAnswer) {
    document.getElementById('answer-input-group').classList.remove('d-none');
    document.getElementById('answer-input').focus();
    document.getElementById('buzz').disabled = true;
  }
}

function clearStats ({ userId }) {
  updateStatDisplay(room.players[userId]);
}

function endOfSet () {
  window.alert('You have reached the end of the set');
}

async function giveAnswer ({ directive, directedPrompt, perQuestionCelerity, score, tossup, userId }) {
  if (directive === 'prompt') {
    document.getElementById('answer-input-group').classList.remove('d-none');
    document.getElementById('answer-input').focus();
    document.getElementById('answer-input').placeholder = directedPrompt ? `Prompt: "${directedPrompt}"` : 'Prompt';
    return;
  }

  if (userId === USER_ID) {
    updateStatDisplay({ ...room.players[USER_ID], directive });
  } else if (aiBot.active) {
    upsertPlayerItem(aiBot.player);
  }

  document.getElementById('answer-input').value = '';
  document.getElementById('answer-input').blur();
  document.getElementById('answer-input').placeholder = 'Enter answer';
  document.getElementById('answer-input-group').classList.add('d-none');
  
  // Enable next button and update its text
  const nextButton = document.getElementById('next');
  nextButton.disabled = false;
  nextButton.textContent = 'Next';

  if (room.settings.rebuzz && directive === 'reject') {
    document.getElementById('buzz').disabled = false;
    document.getElementById('buzz').textContent = 'Buzz';
    document.getElementById('pause').disabled = false;
  }

  if (audio.soundEffects && userId === USER_ID) {
    if (directive === 'accept' && score > 10) {
      audio.power.play();
    } else if (directive === 'accept' && score === 10) {
      audio.correct.play();
    } else if (directive === 'reject') {
      audio.incorrect.play();
    }
  }
}

async function next ({ packetLength, oldTossup, tossup: nextTossup, type }) {
  console.log('next() called with:', { packetLength, oldTossup, nextTossup, type });
  
  if (type === 'start') {
    console.log('Handling start type');
    document.getElementById('next').disabled = false;
    document.getElementById('settings').classList.add('d-none');
  }

  if (type !== 'start') {
    console.log('Creating tossup game card for old tossup');
    createTossupGameCard({
      starred: room.mode === MODE_ENUM.STARRED ? true : (room.mode === MODE_ENUM.LOCAL ? false : null),
      tossup: oldTossup
    });
  }

  // Clear all question and answer displays
  console.log('Clearing all displays...');
  const elements = {
    question: document.getElementById('question'),
    answerDisplay: document.getElementById('answer-display'),
    userAnswer: document.getElementById('user-answer'),
    toggleCorrect: document.getElementById('toggle-correct')
  };

  console.log('Found elements:', {
    question: !!elements.question,
    answerDisplay: !!elements.answerDisplay,
    userAnswer: !!elements.userAnswer,
    toggleCorrect: !!elements.toggleCorrect
  });

  // Clear all text content
  if (elements.question) elements.question.textContent = '';
  if (elements.answerDisplay) elements.answerDisplay.textContent = '';
  if (elements.userAnswer) elements.userAnswer.textContent = '';
  if (elements.toggleCorrect) {
    elements.toggleCorrect.textContent = 'I was wrong';
    elements.toggleCorrect.classList.add('d-none');
  }

  // Hide answer input if it's visible
  const answerInputGroup = document.getElementById('answer-input-group');
  if (answerInputGroup) {
    answerInputGroup.classList.add('d-none');
  }

  console.log('Displays cleared. Current content:', {
    question: elements.question?.textContent,
    answerDisplay: elements.answerDisplay?.textContent,
    userAnswer: elements.userAnswer?.textContent
  });

  if (type === 'end') {
    console.log('Handling end type');
    document.getElementById('buzz').disabled = true;
    document.getElementById('next').disabled = true;
    document.getElementById('pause').disabled = true;
  } else {
    console.log('Setting up for next question');
    document.getElementById('buzz').textContent = 'Buzz';
    document.getElementById('buzz').disabled = false;
    document.getElementById('next').textContent = 'Skip';
    document.getElementById('next').disabled = false;
    document.getElementById('packet-number-info').textContent = nextTossup.packet.number;
    document.getElementById('packet-length-info').textContent = room.mode === MODE_ENUM.SET_NAME ? packetLength : '-';
    document.getElementById('pause').textContent = 'Pause';
    document.getElementById('pause').disabled = false;
    document.getElementById('question-number-info').textContent = nextTossup.number;
    document.getElementById('set-name-info').textContent = nextTossup.set.name;
  }

  if ((type === 'end' || type === 'next') && room.previous.userId === USER_ID && (room.mode !== MODE_ENUM.LOCAL)) {
    const pointValue = room.previous.isCorrect ? (room.previous.inPower ? room.previous.powerValue : 10) : (room.previous.endOfQuestion ? 0 : room.previous.negValue);
    questionStats.recordTossup({
      _id: room.previous.tossup._id,
      celerity: room.previous.celerity,
      isCorrect: room.previous.isCorrect,
      multiplayer: false,
      pointValue
    });
  }
}

function noQuestionsFound () {
  window.alert('No questions found');
}

function pause ({ paused }) {
  console.log('Pause function called with paused:', paused);
  console.log('Current room state:', {
    tossupProgress: room.tossupProgress,
    wordIndex: room.wordIndex,
    questionSplit: room.questionSplit?.length
  });
  
  document.getElementById('buzz').disabled = paused;
  document.getElementById('pause').textContent = paused ? 'Resume' : 'Pause';
  
  // If we're resuming, we need to restart the question reading
  if (!paused && room.tossupProgress === 'READING') {
    console.log('Resuming question reading');
    room.readQuestion(Date.now());
  } else {
    console.log('Not resuming question reading:', {
      paused,
      tossupProgress: room.tossupProgress
    });
  }
}

function revealAnswer ({ answer, question, correctAnswer }) {
  console.log('revealAnswer called with:', { answer, question, correctAnswer });
  
  const elements = {
    question: document.getElementById('question'),
    answerDisplay: document.getElementById('answer-display'),
    userAnswer: document.getElementById('user-answer'),
    pause: document.getElementById('pause'),
    buzz: document.getElementById('buzz'),
    start: document.getElementById('start'),
    toggleCorrect: document.getElementById('toggle-correct')
  };

  console.log('Found elements in revealAnswer:', {
    question: !!elements.question,
    answerDisplay: !!elements.answerDisplay,
    userAnswer: !!elements.userAnswer,
    pause: !!elements.pause,
    buzz: !!elements.buzz,
    start: !!elements.start,
    toggleCorrect: !!elements.toggleCorrect
  });

  if (elements.question) {
    console.log('Setting question content');
    elements.question.innerHTML = question;
  }

  // Use the correct answer from the tossup if available
  const finalCorrectAnswer = correctAnswer || (window.room?.tossup?.answer);
  console.log('Using correct answer:', finalCorrectAnswer);

  if (elements.answerDisplay) {
    console.log('Setting answer display content');
    elements.answerDisplay.innerHTML = 'ANSWER: ' + finalCorrectAnswer;
  }

  if (elements.userAnswer) {
    console.log('Setting user answer content');
    elements.userAnswer.innerHTML = 'YOUR ANSWER: ' + answer;
  }

  console.log('Current display content:', {
    question: elements.question?.innerHTML,
    answerDisplay: elements.answerDisplay?.innerHTML,
    userAnswer: elements.userAnswer?.innerHTML
  });

  if (elements.pause) elements.pause.disabled = true;
  if (elements.buzz) {
    elements.buzz.disabled = true;
    elements.buzz.textContent = 'Buzz';
  }
  if (elements.start) {
    elements.start.disabled = false;
    elements.start.textContent = 'Next';
  }
  if (elements.toggleCorrect) {
    elements.toggleCorrect.classList.remove('d-none');
    elements.toggleCorrect.textContent = room.previous.isCorrect ? 'I was wrong' : 'I was right';
  }
}

function setCategories ({ alternateSubcategories, categories, subcategories, percentView, categoryPercents }) {
  room.categoryManager.loadCategoryModal();
  // Save category state to localStorage
  window.localStorage.setItem('singleplayer-science-bowl-categories', JSON.stringify({
    ...room.categoryManager.export(),
    version: queryVersion
  }));
  window.localStorage.setItem('singleplayer-science-bowl-query', JSON.stringify({ ...room.query, version: queryVersion }));
}

function setDifficulties ({ difficulties }) {
  window.localStorage.setItem('singleplayer-science-bowl-query', JSON.stringify({ ...room.query, version: queryVersion }));
}

function setStrictness ({ strictness }) {
  document.getElementById('set-strictness').value = strictness;
  document.getElementById('strictness-display').textContent = strictness;
  window.localStorage.setItem('singleplayer-science-bowl-settings', JSON.stringify({ ...room.settings, version: settingsVersion }));
}

function setPacketNumbers ({ packetNumbers }) {
  document.getElementById('packet-number').value = arrayToRange(packetNumbers);
  window.localStorage.setItem('singleplayer-science-bowl-query', JSON.stringify({ ...room.query, version: queryVersion }));
}

function setReadingSpeed ({ readingSpeed }) {
  document.getElementById('reading-speed').value = readingSpeed;
  document.getElementById('reading-speed-display').textContent = readingSpeed;
  window.localStorage.setItem('singleplayer-science-bowl-settings', JSON.stringify({ ...room.settings, version: settingsVersion }));
}

async function setSetName ({ setName, setLength }) {
  document.getElementById('set-name').value = setName;
  // make border red if set name is not in set list
  const valid = !setName || api.getSetList().includes(setName);
  document.getElementById('set-name').classList.toggle('is-invalid', !valid);
  maxPacketNumber = setLength;
  document.getElementById('packet-number').placeholder = 'Packet Numbers' + (maxPacketNumber ? ` (1-${maxPacketNumber})` : '');
  window.localStorage.setItem('singleplayer-science-bowl-query', JSON.stringify({ ...room.query, version: queryVersion }));
}

function setYearRange ({ minYear, maxYear }) {
  $('#slider').slider('values', [minYear, maxYear]);
  document.getElementById('year-range-a').textContent = minYear;
  document.getElementById('year-range-b').textContent = maxYear;
  window.localStorage.setItem('singleplayer-science-bowl-query', JSON.stringify({ ...room.query, version: queryVersion }));
}

function toggleAiMode ({ aiMode }) {
  if (aiMode) { upsertPlayerItem(aiBot.player); }

  aiBot.active = aiMode;
  document.getElementById('ai-settings').disabled = !aiMode;
  document.getElementById('toggle-ai-mode').checked = aiMode;
  document.getElementById('player-list-group').classList.toggle('d-none', !aiMode);
  document.getElementById('player-list-group-hr').classList.toggle('d-none', !aiMode);
  window.localStorage.setItem('singleplayer-science-bowl-settings', JSON.stringify({ ...room.settings, version: settingsVersion }));
}

function toggleCorrect ({ correct, userId }) {
  if (userId !== USER_ID) { return; }
  document.getElementById('toggle-correct').classList.add('d-none');
}

function togglePowermarkOnly ({ powermarkOnly }) {
  document.getElementById('toggle-powermark-only').checked = powermarkOnly;
  window.localStorage.setItem('singleplayer-science-bowl-query', JSON.stringify({ ...room.query, version: queryVersion }));
}

function toggleRebuzz ({ rebuzz }) {
  document.getElementById('toggle-rebuzz').checked = rebuzz;
  window.localStorage.setItem('singleplayer-science-bowl-settings', JSON.stringify({ ...room.settings, version: settingsVersion }));
}

function setMode ({ mode, setName }) {
  document.getElementById('set-mode').value = mode;
  document.getElementById('local-packet-settings').classList.toggle('d-none', mode !== 'local packet');
  document.getElementById('set-settings').classList.toggle('d-none', mode !== 'select by set name');
  document.getElementById('difficulty-settings').classList.toggle('d-none', mode === 'local packet');
  document.getElementById('toggle-powermark-only').disabled = mode === 'local packet';
  document.getElementById('toggle-standard-only').disabled = mode === 'local packet';
  document.getElementById('category-select-button').disabled = mode === 'local packet';
  document.getElementById('ai-settings').disabled = mode === 'local packet' || !room.settings.aiMode;
  document.getElementById('toggle-ai-mode').disabled = mode === 'local packet';
  document.getElementById('clear-stats').disabled = mode === 'local packet';
  document.getElementById('set-name').value = setName || '';
  window.localStorage.setItem('singleplayer-science-bowl-mode', JSON.stringify({ mode, setName, version: modeVersion }));
}

function toggleShowHistory ({ showHistory }) {
  document.getElementById('toggle-show-history').checked = showHistory;
  document.getElementById('room-history').classList.toggle('d-none', !showHistory);
  window.localStorage.setItem('singleplayer-science-bowl-settings', JSON.stringify({ ...room.settings, version: settingsVersion }));
}

function toggleStandardOnly ({ standardOnly }) {
  document.getElementById('toggle-standard-only').checked = standardOnly;
  window.localStorage.setItem('singleplayer-science-bowl-query', JSON.stringify({ ...room.query, version: queryVersion }));
}

function toggleTimer ({ timer }) {
  document.getElementById('toggle-timer').checked = timer;
  window.localStorage.setItem('singleplayer-science-bowl-settings', JSON.stringify({ ...room.settings, version: settingsVersion }));
}

function toggleTypeToAnswer ({ typeToAnswer }) {
  document.getElementById('type-to-answer').checked = typeToAnswer;
  window.localStorage.setItem('singleplayer-science-bowl-settings', JSON.stringify({ ...room.settings, version: settingsVersion }));
}

function updateQuestion ({ word }) {
  document.getElementById('question').textContent += word + ' ';
}

// Make updateStatDisplay globally accessible
window.updateStatDisplay = function() {
  console.log('updateStatDisplay called');
  console.log('Current room state:', {
    room: window.room,
    tossup: window.room?.tossup,
    questionType: window.room?.tossup?.type,
    isTossup: window.room?.tossup?.isTossup,
    rawIsTossup: window.room?.tossup?.isTossup === false ? 'false' : 
                 window.room?.tossup?.isTossup === true ? 'true' : 
                 window.room?.tossup?.isTossup === undefined ? 'undefined' : 
                 window.room?.tossup?.isTossup === null ? 'null' : 
                 String(window.room?.tossup?.isTossup)
  });

  // Get the current score from the statline element
  const statline = document.getElementById('statline');
  const currentScore = parseInt(statline.textContent.split(': ')[1]) || 0;
  console.log('Current score:', currentScore);
  
  // Check if current question is a bonus
  // A question is a bonus if isTossup is explicitly false
  const isBonus = window.room?.tossup?.isTossup === false;
  console.log('Is bonus question?', isBonus, 'because isTossup is:', window.room?.tossup?.isTossup);
  
  // Increment score by 10 for bonus, 4 for tossup
  const pointsToAdd = isBonus ? 10 : 4;
  console.log('Points to add:', pointsToAdd);
  
  const newScore = currentScore + pointsToAdd;
  console.log('New score:', newScore);
  
  statline.textContent = `SCORE: ${newScore}`;
}

function updateTimerDisplay (time) {
  const face = Math.floor(time / 10);
  const fraction = time % 10;
  document.getElementById('timer').querySelector('.face').textContent = face;
  document.getElementById('timer').querySelector('.fraction').textContent = '.' + fraction;
}

// Initialize the room
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, setting up event handlers');
  
  // Use the global room instance instead of creating a new one
  console.log('Using global room instance:', window.room);
  const room = window.room;
  console.log('Category manager:', room.categoryManager);
  console.log('Initial categories:', room.categoryManager.categories);
  
  // Initialize button states
  document.getElementById('start').disabled = false;
  document.getElementById('start').textContent = 'Start/Next';
  document.getElementById('buzz').disabled = true;
  document.getElementById('pause').disabled = false;
  document.getElementById('pause').textContent = 'Pause';
  
  // Load saved settings
  const savedSettings = localStorage.getItem('singleplayer-science-bowl-settings');
  console.log('Loading saved settings:', savedSettings);
  if (savedSettings) {
    const settings = JSON.parse(savedSettings);
    if (settings.version === settingsVersion) {
      room.settings = { ...room.settings, ...settings };
      document.getElementById('toggle-ai-mode').checked = room.settings.aiMode;
      document.getElementById('toggle-rebuzz').checked = room.settings.rebuzz;
      document.getElementById('toggle-show-history').checked = room.settings.showHistory;
      document.getElementById('toggle-timer').checked = room.settings.timer;
      document.getElementById('type-to-answer').checked = room.settings.typeToAnswer;
      document.getElementById('set-strictness').value = room.settings.strictness;
      document.getElementById('strictness-display').textContent = room.settings.strictness;
      document.getElementById('reading-speed').value = room.settings.readingSpeed;
      document.getElementById('reading-speed-display').textContent = room.settings.readingSpeed;
    }
  }

  // Load saved category state
  const savedCategoryState = JSON.parse(window.localStorage.getItem('singleplayer-science-bowl-categories') || '{}');
  console.log('Loading saved category state:', savedCategoryState);
  if (savedCategoryState.version === queryVersion) {
    room.categoryManager.import(savedCategoryState);
    room.query.subjects = room.categoryManager.categories;
    // Update checkbox states immediately after loading saved state
    console.log('Updating checkbox states after loading saved state');
    document.querySelectorAll('.category-checkbox').forEach(checkbox => {
      checkbox.checked = room.categoryManager.categories.includes(checkbox.id);
    });
  }

  // Load saved mode
  const savedMode = JSON.parse(window.localStorage.getItem('singleplayer-science-bowl-mode') || '{}');
  if (savedMode.version === modeVersion) {
    setMode(savedMode);
  }

  // Load saved query
  const savedQuery = JSON.parse(window.localStorage.getItem('singleplayer-science-bowl-query') || '{}');
  if (savedQuery.version === queryVersion) {
    room.query = { ...room.query, ...savedQuery };
    document.getElementById('set-name').value = room.query.setName;
    document.getElementById('packet-number').value = arrayToRange(room.query.packetNumbers);
    $('#slider').slider('values', [room.query.minYear, room.query.maxYear]);
    document.getElementById('year-range-a').textContent = room.query.minYear;
    document.getElementById('year-range-b').textContent = room.query.maxYear;
  }

  // Initialize UI components immediately
  console.log('Setting up event handlers immediately');
  const modalRoot = document.getElementById('category-modal-root');
  console.log('Found modal element:', modalRoot);

  if (modalRoot) {
    console.log('About to initialize category modal handlers');
    try {
      // Add modal show/hide handlers
      const showHandler = () => {
        console.log('Modal shown');
        console.log('Current categories:', room.categoryManager.categories);
        room.categoryManager.loadCategoryModal();
        // Update checkbox states
        document.querySelectorAll('.category-checkbox').forEach(checkbox => {
          checkbox.checked = room.categoryManager.categories.includes(checkbox.id);
        });
      };
      
      const hideHandler = () => {
        console.log('Modal hidden');
        console.log('Current categories:', room.categoryManager.categories);
        socket.sendToServer({ type: 'set-categories', ...room.categoryManager.export() });
      };
      
      modalRoot.addEventListener('show.bs.modal', showHandler);
      modalRoot.addEventListener('hidden.bs.modal', hideHandler);
      console.log('Modal show/hide handlers attached');

      console.log('Category modal handlers initialized successfully');
    } catch (error) {
      console.error('Error initializing category modal:', error);
    }
  } else {
    console.error('Modal root element not found');
  }

  // Add other event handlers
  document.getElementById('answer-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const answer = document.getElementById('answer-input').value;
    room.message(USER_ID, { type: 'give-answer', givenAnswer: answer });
  });

  document.getElementById('buzz').addEventListener('click', () => {
    room.message(USER_ID, { type: 'buzz' });
  });

  document.getElementById('clear-stats').addEventListener('click', () => {
    room.message(USER_ID, { type: 'clear-stats' });
  });

  // Add start button handler with detailed logging
  const startButton = document.getElementById('start');
  console.log('Found start button:', startButton);
  if (startButton) {
    startButton.addEventListener('click', () => {
      console.log('Start/Next button clicked');
      console.log('Current room state:', {
        categories: room.categoryManager.categories,
        query: room.query,
        mode: room.mode
      });
      // Ensure categories are synced before starting
      room.query.subjects = room.categoryManager.categories;
      console.log('Starting with categories:', room.categoryManager.categories);
      room.message(USER_ID, { type: 'start' });
    });
    console.log('Start button handler attached');
  } else {
    console.error('Start button not found!');
  }

  document.getElementById('toggle-correct').addEventListener('click', () => {
    room.message(USER_ID, { type: 'toggle-correct' });
  });

  document.getElementById('toggle-ai-mode').addEventListener('change', (e) => {
    room.message(USER_ID, { type: 'toggle-ai-mode', aiMode: e.target.checked });
  });

  document.getElementById('toggle-rebuzz').addEventListener('change', (e) => {
    room.message(USER_ID, { type: 'toggle-rebuzz', rebuzz: e.target.checked });
  });

  document.getElementById('toggle-show-history').addEventListener('change', (e) => {
    room.message(USER_ID, { type: 'toggle-show-history', showHistory: e.target.checked });
  });

  document.getElementById('toggle-timer').addEventListener('change', (e) => {
    room.message(USER_ID, { type: 'toggle-timer', timer: e.target.checked });
  });

  document.getElementById('type-to-answer').addEventListener('change', (e) => {
    room.message(USER_ID, { type: 'toggle-type-to-answer', typeToAnswer: e.target.checked });
  });

  document.getElementById('set-strictness').addEventListener('input', (e) => {
    room.message(USER_ID, { type: 'set-strictness', strictness: parseInt(e.target.value) });
  });

  document.getElementById('reading-speed').addEventListener('input', (e) => {
    room.message(USER_ID, { type: 'set-reading-speed', readingSpeed: parseInt(e.target.value) });
  });

  // Add pause button handler
  document.getElementById('pause').addEventListener('click', () => {
    console.log('Pause button clicked');
    room.message(USER_ID, { type: 'pause' });
  });

  // Set up keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') { return; }
    switch (e.key) {
      case ' ': return room.message(USER_ID, { type: 'buzz' });
      case 'n': return room.message(USER_ID, { type: 'start' });
      case 'p': return room.message(USER_ID, { type: 'pause' });
      case 's': return room.message(USER_ID, { type: 'start' });
    }
  });

  // Initialize the room
  room.message(USER_ID, { type: 'start' });
}); 
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
  const typeToAnswer = (function () {
    const el = document.getElementById('type-to-answer');
    return el ? el.checked : true; // default to enabled if control absent
  })();
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

async function giveAnswer ({ directive, directedPrompt, perQuestionCelerity, score, tossup, userId, isCorrect }) {
  if (directive === 'prompt') {
    document.getElementById('answer-input-group').classList.remove('d-none');
    document.getElementById('answer-input').focus();
    document.getElementById('answer-input').placeholder = directedPrompt ? `Prompt: "${directedPrompt}"` : 'Prompt';
    return;
  }

  if (userId === USER_ID) {
    // Update the player's score based on isCorrect
    if (isCorrect) {
      const pointValue = tossup?.isTossup ? 4 : 10; // 4 points for tossup, 10 for bonus
      room.players[USER_ID].score += pointValue;
      updateStatDisplay();
    }
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
    if (isCorrect) {
      audio.correct.play();
    } else {
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
  
  // Hide AI help section when starting new question
  hideAIHelpSection();

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
    recordSessionScienceBowlStat(room.previous.tossup?.subject, room.previous.isCorrect, room.previous.tossup?._id);
    if (typeof window.refreshScienceBowlSubjectStats === 'function') {
      window.refreshScienceBowlSubjectStats();
    }
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

function revealAnswer ({ answer, question, correctAnswer, isCorrect }) {
  console.log('revealAnswer called with:', { answer, question, correctAnswer, isCorrect });
  
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
    // Use the isCorrect flag if provided, otherwise fall back to room.previous.isCorrect
    const wasCorrect = isCorrect !== undefined ? isCorrect : room.previous.isCorrect;
    elements.toggleCorrect.textContent = wasCorrect ? 'I was wrong' : 'I was right';
  }
  
  // Show AI help section when answer is revealed
  console.log('About to show AI help section from revealAnswer');
  showAIHelpSection();
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
  const el = document.getElementById('set-strictness');
  const disp = document.getElementById('strictness-display');
  if (el) el.value = strictness;
  if (disp) disp.textContent = strictness;
  window.localStorage.setItem('singleplayer-science-bowl-settings', JSON.stringify({ ...room.settings, version: settingsVersion }));
}

function setPacketNumbers ({ packetNumbers }) {
  document.getElementById('packet-number').value = arrayToRange(packetNumbers);
  window.localStorage.setItem('singleplayer-science-bowl-query', JSON.stringify({ ...room.query, version: queryVersion }));
}

function setReadingSpeed ({ readingSpeed }) {
  const el = document.getElementById('reading-speed');
  const disp = document.getElementById('reading-speed-display');
  if (el) el.value = readingSpeed;
  if (disp) disp.textContent = readingSpeed;
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
  const aiSettingsBtn = document.getElementById('ai-settings'); if (aiSettingsBtn) aiSettingsBtn.disabled = !aiMode;
  const aiToggle = document.getElementById('toggle-ai-mode'); if (aiToggle) aiToggle.checked = aiMode;
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
  const el = document.getElementById('toggle-rebuzz'); if (el) el.checked = rebuzz;
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
  const aiSettingsBtn2 = document.getElementById('ai-settings'); if (aiSettingsBtn2) aiSettingsBtn2.disabled = mode === 'local packet' || !room.settings.aiMode;
  const aiToggle2 = document.getElementById('toggle-ai-mode'); if (aiToggle2) aiToggle2.disabled = mode === 'local packet';
  document.getElementById('clear-stats').disabled = mode === 'local packet';
  document.getElementById('set-name').value = setName || '';
  window.localStorage.setItem('singleplayer-science-bowl-mode', JSON.stringify({ mode, setName, version: modeVersion }));
}

function toggleShowHistory ({ showHistory }) {
  const el = document.getElementById('toggle-show-history'); if (el) el.checked = showHistory;
  document.getElementById('room-history').classList.toggle('d-none', !showHistory);
  window.localStorage.setItem('singleplayer-science-bowl-settings', JSON.stringify({ ...room.settings, version: settingsVersion }));
}

function toggleStandardOnly ({ standardOnly }) {
  document.getElementById('toggle-standard-only').checked = standardOnly;
  window.localStorage.setItem('singleplayer-science-bowl-query', JSON.stringify({ ...room.query, version: queryVersion }));
}

function toggleTimer ({ timer }) {
  const el = document.getElementById('toggle-timer'); if (el) el.checked = timer;
  window.localStorage.setItem('singleplayer-science-bowl-settings', JSON.stringify({ ...room.settings, version: settingsVersion }));
}

function toggleTypeToAnswer ({ typeToAnswer }) {
  const el = document.getElementById('type-to-answer'); if (el) el.checked = typeToAnswer;
  window.localStorage.setItem('singleplayer-science-bowl-settings', JSON.stringify({ ...room.settings, version: settingsVersion }));
}

function updateQuestion ({ word }) {
  const questionElement = document.getElementById('question');
  if (!questionElement) return;

  // If the word starts with a newline, it's a multiple-choice option
  if (word.startsWith('\n')) {
    // Add a line break before the option
    questionElement.innerHTML += '<br>';
    // Add the option text
    questionElement.innerHTML += word.substring(1);
  } else {
    // For regular question text, add a space if needed
    if (questionElement.innerHTML && !questionElement.innerHTML.endsWith(' ')) {
      questionElement.innerHTML += ' ';
    }
    questionElement.innerHTML += word;
  }
  
  // Don't show AI help section here - wait until answer is revealed
  // console.log('updateQuestion called - NOT showing AI help yet');
}

// Make updateStatDisplay globally accessible
window.updateStatDisplay = function() {
  console.log('updateStatDisplay called');
  console.log('Current room state:', {
    room: window.room,
    tossup: window.room?.tossup,
    isTossup: window.room?.tossup?.isTossup
  });

  // Get the current score from the statline element
  const statline = document.getElementById('statline');
  const currentScore = parseInt(statline.textContent.split(': ')[1]) || 0;
  console.log('Current score:', currentScore);
  
  // Check if current question is a tossup
  // A question is a tossup if isTossup is true
  const isTossup = window.room?.tossup?.isTossup === true;
  console.log('Is tossup question?', isTossup, 'because isTossup is:', window.room?.tossup?.isTossup);
  
  // Increment score by 4 for tossup, 10 for bonus
  const pointsToAdd = isTossup ? 4 : 10;
  console.log('Points to add:', pointsToAdd);
  
  const newScore = currentScore + pointsToAdd;
  console.log('New score:', newScore);
  
  statline.textContent = `SCORE: ${newScore}`;
}

function recordSessionScienceBowlStat(subject, isCorrect, tossupId) {
  if (typeof window.sbRecordSessionStat === 'function') {
    window.sbRecordSessionStat({ subject, isCorrect, tossupId });
    return;
  }

  if (!subject) {
    console.warn('[Science Bowl] Skipping session stat (no subject)', { isCorrect, tossupId });
    return;
  }

  const normalizedSubject = subject.toUpperCase();
  console.log('[Science Bowl] Recording session stat (fallback)', { subject: normalizedSubject, originalSubject: subject, isCorrect, tossupId });

  fetch('/api/science-bowl/session-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject: normalizedSubject, isCorrect })
  })
    .then(async response => {
      console.log('[Science Bowl] Session stat response', { status: response.status });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Session stat failed (${response.status}): ${text}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('[Science Bowl] Session stat updated payload', data);
    })
    .catch(error => {
      console.error('[Science Bowl] Failed to record session stat', { error, subject: normalizedSubject, isCorrect, tossupId });
    });
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
      const elAi = document.getElementById('toggle-ai-mode'); if (elAi) elAi.checked = room.settings.aiMode;
      const elReb = document.getElementById('toggle-rebuzz'); if (elReb) elReb.checked = room.settings.rebuzz;
      const elHist = document.getElementById('toggle-show-history'); if (elHist) elHist.checked = room.settings.showHistory;
      const elTim = document.getElementById('toggle-timer'); if (elTim) elTim.checked = room.settings.timer;
      const elType = document.getElementById('type-to-answer'); if (elType) elType.checked = room.settings.typeToAnswer;
      const elStrict = document.getElementById('set-strictness'); if (elStrict) elStrict.value = room.settings.strictness;
      const elStrictDisp = document.getElementById('strictness-display'); if (elStrictDisp) elStrictDisp.textContent = room.settings.strictness;
      const elSpeed = document.getElementById('reading-speed'); if (elSpeed) elSpeed.value = room.settings.readingSpeed;
      const elSpeedDisp = document.getElementById('reading-speed-display'); if (elSpeedDisp) elSpeedDisp.textContent = room.settings.readingSpeed;
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

  const elToggleAI = document.getElementById('toggle-ai-mode');
  if (elToggleAI) {
    elToggleAI.addEventListener('change', (e) => {
      room.message(USER_ID, { type: 'toggle-ai-mode', aiMode: e.target.checked });
    });
  }

  const elRebuzz = document.getElementById('toggle-rebuzz');
  if (elRebuzz) {
    elRebuzz.addEventListener('change', (e) => {
      room.message(USER_ID, { type: 'toggle-rebuzz', rebuzz: e.target.checked });
    });
  }

  const elShowHistory = document.getElementById('toggle-show-history');
  if (elShowHistory) {
    elShowHistory.addEventListener('change', (e) => {
      room.message(USER_ID, { type: 'toggle-show-history', showHistory: e.target.checked });
    });
  }

  const elTimer = document.getElementById('toggle-timer');
  if (elTimer) {
    elTimer.addEventListener('change', (e) => {
      room.message(USER_ID, { type: 'toggle-timer', timer: e.target.checked });
    });
  }

  const elTypeToAnswer = document.getElementById('type-to-answer');
  if (elTypeToAnswer) {
    elTypeToAnswer.addEventListener('change', (e) => {
      room.message(USER_ID, { type: 'toggle-type-to-answer', typeToAnswer: e.target.checked });
    });
  }

  const elStrictness = document.getElementById('set-strictness');
  if (elStrictness) {
    elStrictness.addEventListener('input', (e) => {
      room.message(USER_ID, { type: 'set-strictness', strictness: parseInt(e.target.value) });
    });
  }

  const elReadingSpeed = document.getElementById('reading-speed');
  if (elReadingSpeed) {
    elReadingSpeed.addEventListener('input', (e) => {
      room.message(USER_ID, { type: 'set-reading-speed', readingSpeed: parseInt(e.target.value) });
    });
  }

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
      case 'n':
        hideAIHelpSection();
        return room.message(USER_ID, { type: 'start' });
      case 'p': return room.message(USER_ID, { type: 'pause' });
      case 's':
        hideAIHelpSection();
        return room.message(USER_ID, { type: 'start' });
    }
  });

  // Also clear AI panels immediately when clicking the Start/Next button
  const startBtn = document.getElementById('start');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      try { hideAIHelpSection(); } catch (_) {}
    });
  }

  // Initialize the room
  room.message(USER_ID, { type: 'start' });
  
  // Add AI help functionality
  console.log('About to initialize AI help...');
  // Initialize immediately if DOM is ready, otherwise wait
  try {
    initializeAIHelp();
  } catch (e) {
    console.warn('initializeAIHelp threw, will retry on DOMContentLoaded:', e);
  }
  // Fallback: click delegation and mutation observer do not depend on timing
  setupAIHelpClickDelegation();
  observeAnswerReveal();
  console.log('AI help initialization complete!');
  
  // Hide AI help section initially
  hideAIHelpSection();
}); 

// AI Help Functions
function showAIHelpSection() {
  console.log('showAIHelpSection called');
  const aiHelpSection = document.getElementById('ai-help-section');
  console.log('AI help section element:', aiHelpSection);
  
  if (aiHelpSection) {
    aiHelpSection.classList.remove('d-none');
    console.log('AI help section shown');
    // Reset explanation state
    hideAIExplanation();
    // Bring the AI help section into view for visibility
    try {
      aiHelpSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      // no-op if scrollIntoView not available
    }
  } else {
    console.error('AI help section element not found!');
  }
}

function hideAIHelpSection() {
  console.log('hideAIHelpSection called');
  const aiHelpSection = document.getElementById('ai-help-section');
  if (aiHelpSection) {
    aiHelpSection.classList.add('d-none');
    console.log('AI help section hidden');
    // Also hide any explanation
    hideAIExplanation();
  }
}

function hideAIExplanation() {
  const aiExplanation = document.getElementById('ai-explanation');
  const explanationContent = document.getElementById('explanation-content');
  const explanationLoading = document.getElementById('explanation-loading');
  
  if (aiExplanation) aiExplanation.classList.add('d-none');
  if (explanationContent) explanationContent.innerHTML = '';
  if (explanationLoading) explanationLoading.classList.add('d-none');

  // Also hide and clear suggested reading if present
  const suggestedCard = document.getElementById('suggested-reading');
  const suggestedContent = document.getElementById('suggested-reading-content');
  const suggestedLoading = document.getElementById('suggested-reading-loading');
  if (suggestedCard) suggestedCard.classList.add('d-none');
  if (suggestedContent) suggestedContent.innerHTML = '';
  if (suggestedLoading) suggestedLoading.classList.add('d-none');

  // Also hide and clear extra practice if present
  const practiceCard = document.getElementById('extra-practice');
  const practiceContent = document.getElementById('extra-practice-content');
  const practiceLoading = document.getElementById('extra-practice-loading');
  if (practiceCard) practiceCard.classList.add('d-none');
  if (practiceContent) practiceContent.innerHTML = '';
  if (practiceLoading) practiceLoading.classList.add('d-none');
}

function showAIExplanation() {
  const aiExplanation = document.getElementById('ai-explanation');
  if (aiExplanation) {
    aiExplanation.classList.remove('d-none');
  }
}

function showLoadingState() {
  const explanationContent = document.getElementById('explanation-content');
  const explanationLoading = document.getElementById('explanation-loading');
  
  if (explanationContent) explanationContent.innerHTML = '';
  if (explanationLoading) explanationLoading.classList.remove('d-none');
}

function hideLoadingState() {
  const explanationLoading = document.getElementById('explanation-loading');
  if (explanationLoading) explanationLoading.classList.add('d-none');
}

function displayExplanation(explanation) {
  const explanationContent = document.getElementById('explanation-content');
  if (explanationContent) {
    explanationContent.innerHTML = explanation.replace(/\n/g, '<br>');
  }
}

function renderSuggestions(suggestions) {
  const container = document.getElementById('suggested-reading');
  const content = document.getElementById('suggested-reading-content');
  const loading = document.getElementById('suggested-reading-loading');
  if (!container || !content) return;
  container.classList.remove('d-none');
  if (loading) loading.classList.add('d-none');
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    content.innerHTML = '<div class="alert alert-warning">No suggestions returned.</div>';
    return;
  }
  const items = suggestions.map((s) => {
    const title = s.title || 'Resource';
    const type = s.type ? `<span class="badge bg-secondary ms-2">${s.type}</span>` : '';
    const notes = s.notes ? `<div class="small text-muted">${s.notes}</div>` : '';
    const link = s.link ? `<a href="${s.link}" target="_blank" rel="noopener">${s.link}</a>` : '';
    return `<li class="mb-2"><strong>${title}</strong> ${type}<br>${notes}${link ? '<div>' + link + '</div>' : ''}</li>`;
  }).join('');
  content.innerHTML = `<ul class="mb-0 ps-3">${items}</ul>`;
}

async function getAIExplanation() {
  try {
    // Get current question and answer
    const questionElement = document.getElementById('question');
    const answerDisplay = document.getElementById('answer-display');
    
    if (!questionElement || !answerDisplay) {
      console.error('Question or answer elements not found');
      return;
    }
    
    const question = questionElement.textContent.trim();
    // Strip the leading "ANSWER:" label if present before sending to API
    const rawAnswerText = answerDisplay.textContent.trim();
    const answer = rawAnswerText.replace(/^ANSWER:\s*/i, '');
    // Also capture the user's answer if present
    const userAnswerEl = document.getElementById('user-answer');
    const rawUserAnswer = userAnswerEl?.textContent?.trim() || '';
    const userAnswer = rawUserAnswer.replace(/^YOUR ANSWER:\s*/i, '');
    // Try to detect last correctness from room state
    const userIsCorrect = (window.room?.previous?.isCorrect === true);
    
    // Include MCQ options if available from room state
    const isMcq = !!(window.room?.tossup?.is_mcq && Array.isArray(window.room?.tossup?.options));
    const options = isMcq ? window.room.tossup.options : undefined;
    
    if (!question || !answer) {
      alert('Please wait for the question to be fully loaded and answered before requesting AI help.');
      return;
    }
    
    // Show loading state
    showLoadingState();
    showAIExplanation();
    
    // Make API call to get AI explanation
    const response = await fetch('/api/ai-help/explain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: question,
        answer: answer,
        category: getCurrentCategory(),
        isMcq,
        options,
        userAnswer,
        userIsCorrect
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get AI explanation');
    }
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const text = await response.text();
      throw new Error('Unexpected non-JSON response: ' + text.slice(0, 60));
    }
    const data = await response.json();
    
    // Hide loading and display explanation
    hideLoadingState();
    displayExplanation(data.explanation);
    
  } catch (error) {
    console.error('Error getting AI explanation:', error);
    hideLoadingState();
    
    // Show error message
    const explanationContent = document.getElementById('explanation-content');
    if (explanationContent) {
      explanationContent.innerHTML = `
        <div class="alert alert-danger">
          <strong>Error:</strong> ${error.message}
          <br><small>Please try again later or contact support if the problem persists.</small>
        </div>
      `;
    }
  }
}

// Robust click binding: delegate to document so handler exists even if button is added later
function setupAIHelpClickDelegation() {
  if (window.__aiHelpClickDelegationAttached) return;
  document.addEventListener('click', (e) => {
    const btn = e.target?.closest && e.target.closest('#get-ai-help');
    if (btn) {
      e.preventDefault();
      try {
        console.log('Delegated click: Get AI Explanation');
        getAIExplanation();
      } catch (err) {
        console.error('Delegated click failed:', err);
      }
    }
  });
  window.__aiHelpClickDelegationAttached = true;
}

// Fallback: observe when the answer is revealed in the DOM, then show + auto-fetch
function observeAnswerReveal() {
  try {
    const answerEl = document.getElementById('answer-display');
    if (!answerEl) return;
    if (window.__aiHelpObserverAttached) return;
    const obs = new MutationObserver(() => {
      const text = answerEl.textContent?.trim() || '';
      if (text.length > 0) {
        console.log('MutationObserver detected answer reveal. Showing AI help...');
        showAIHelpSection();
        // Do not auto-fetch; wait for user to click the button
      }
    });
    obs.observe(answerEl, { childList: true, subtree: true, characterData: true });
    window.__aiHelpObserverAttached = true;
  } catch (e) {
    console.warn('observeAnswerReveal setup failed:', e);
  }
}

function getCurrentCategory() {
  // Try to get category from room state or UI
  if (room && room.categoryManager && room.categoryManager.categories.length > 0) {
    return room.categoryManager.categories[0]; // Return first selected category
  }
  
  // Fallback to checking which category checkboxes are checked
  const checkedCategories = document.querySelectorAll('.category-checkbox:checked');
  if (checkedCategories.length > 0) {
    return checkedCategories[0].id;
  }
  
  return 'Science'; // Default fallback
}

function initializeAIHelp() {
  console.log('initializeAIHelp called');
  
  // Add event listener for AI help button
  const aiHelpButton = document.getElementById('get-ai-help');
  console.log('AI help button element:', aiHelpButton);
  
  if (aiHelpButton) {
    aiHelpButton.addEventListener('click', getAIExplanation);
    console.log('AI help button initialized successfully');
  } else {
    console.error('AI help button not found - this will prevent the feature from working!');
  }
  
  // Suggested reading button
  const readingBtn = document.getElementById('get-suggested-reading');
  if (readingBtn) {
    readingBtn.addEventListener('click', async () => {
      try {
        const questionElement = document.getElementById('question');
        const answerDisplay = document.getElementById('answer-display');
        const question = questionElement?.textContent?.trim() || '';
        const rawAnswerText = answerDisplay?.textContent?.trim() || '';
        const answer = rawAnswerText.replace(/^ANSWER:\\s*/i, '');
        const resp = await fetch('/api/ai-help/suggest-reading', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, answer, category: getCurrentCategory() })
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to get suggestions');
        }
        const data = await resp.json();
        renderSuggestions(data.suggestions);
      } catch (e) {
        console.error('Failed to get suggested reading:', e);
      }
    });
  }

  // Add event listener for test button
  const testButton = document.getElementById('test-ai-help');
  console.log('Test button element:', testButton);
  
  if (testButton) {
    testButton.addEventListener('click', testAIHelp);
    console.log('Test button initialized successfully');
  } else {
    console.error('Test button not found!');
  }
  
  // Also check if the AI help section exists
  const aiHelpSection = document.getElementById('ai-help-section');
  console.log('AI help section element:', aiHelpSection);
  
  if (!aiHelpSection) {
    console.error('AI help section not found - this is a critical error!');
  }
  
  console.log('AI help initialization complete');
}

// Test function for debugging
function testAIHelp() {
  console.log('=== AI HELP DEBUG TEST ===');
  console.log('1. Testing element existence:');
  console.log('   - AI help section:', document.getElementById('ai-help-section'));
  console.log('   - AI help button:', document.getElementById('get-ai-help'));
  console.log('   - AI explanation div:', document.getElementById('ai-explanation'));
  
  console.log('2. Testing showAIHelpSection function:');
  showAIHelpSection();
  
  console.log('3. Current visibility states:');
  const aiHelpSection = document.getElementById('ai-help-section');
  const aiExplanation = document.getElementById('ai-explanation');
  
  if (aiHelpSection) {
    console.log('   - AI help section classes:', aiHelpSection.className);
    console.log('   - AI help section hidden:', aiHelpSection.classList.contains('d-none'));
  }
  
  if (aiExplanation) {
    console.log('   - AI explanation classes:', aiExplanation.className);
    console.log('   - AI explanation hidden:', aiExplanation.classList.contains('d-none'));
  }
  
  console.log('=== END DEBUG TEST ===');
}

// Expose a small debug API so you can call from DevTools
// Example: AIHelpDebug.test()
window.AIHelpDebug = {
  show: showAIHelpSection,
  hide: hideAIHelpSection,
  explain: getAIExplanation,
  init: initializeAIHelp,
  test: testAIHelp
};
console.log('AIHelpDebug available. Try AIHelpDebug.test() in console.');

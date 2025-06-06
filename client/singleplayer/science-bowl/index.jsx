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
    updateStatDisplay(room.players[USER_ID]);
  } else if (aiBot.active) {
    upsertPlayerItem(aiBot.player);
  }

  document.getElementById('answer-input').value = '';
  document.getElementById('answer-input').blur();
  document.getElementById('answer-input').placeholder = 'Enter answer';
  document.getElementById('answer-input-group').classList.add('d-none');
  document.getElementById('next').disabled = false;

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
  if (type === 'start') {
    document.getElementById('next').disabled = false;
    document.getElementById('settings').classList.add('d-none');
  }

  if (type !== 'start') {
    createTossupGameCard({
      starred: room.mode === MODE_ENUM.STARRED ? true : (room.mode === MODE_ENUM.LOCAL ? false : null),
      tossup: oldTossup
    });
  }

  document.getElementById('answer').textContent = '';
  document.getElementById('question').textContent = '';
  document.getElementById('toggle-correct').textContent = 'I was wrong';
  document.getElementById('toggle-correct').classList.add('d-none');

  if (type === 'end') {
    document.getElementById('buzz').disabled = true;
    document.getElementById('next').disabled = true;
    document.getElementById('pause').disabled = true;
  } else {
    document.getElementById('buzz').textContent = 'Buzz';
    document.getElementById('buzz').disabled = false;
    document.getElementById('next').textContent = 'Skip';
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
  document.getElementById('buzz').disabled = paused;
  document.getElementById('pause').textContent = paused ? 'Resume' : 'Pause';
}

function revealAnswer ({ answer, question }) {
  document.getElementById('question').innerHTML = question;
  document.getElementById('answer').innerHTML = 'ANSWER: ' + answer;
  document.getElementById('pause').disabled = true;

  document.getElementById('buzz').disabled = true;
  document.getElementById('buzz').textContent = 'Buzz';
  document.getElementById('next').disabled = false;
  document.getElementById('next').textContent = 'Next';
  document.getElementById('start').disabled = false;

  document.getElementById('toggle-correct').classList.remove('d-none');
  document.getElementById('toggle-correct').textContent = room.previous.isCorrect ? 'I was wrong' : 'I was right';
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

function updateStatDisplay ({ powers, tens, negs, tuh, points, celerity }) {
  document.getElementById('statline').textContent = `${powers}/${tens}/${negs} with ${tuh} tossups seen (${points} pts, celerity: ${celerity.toFixed(2)})`;
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
  
  // Initialize room
  console.log('Initializing room...');
  const room = new ClientScienceBowlRoom();
  console.log('Room initialized:', room);
  console.log('Category manager:', room.categoryManager);
  console.log('Initial categories:', room.categoryManager.categories);
  
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

  document.getElementById('next').addEventListener('click', () => {
    room.message(USER_ID, { type: 'next' });
  });

  document.getElementById('pause').addEventListener('click', () => {
    room.message(USER_ID, { type: 'pause' });
  });

  document.getElementById('start').addEventListener('click', () => {
    room.message(USER_ID, { type: 'start' });
  });

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

  // Set up keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') { return; }
    switch (e.key) {
      case ' ': return room.message(USER_ID, { type: 'buzz' });
      case 'n': return room.message(USER_ID, { type: 'next' });
      case 'p': return room.message(USER_ID, { type: 'pause' });
      case 's': return room.message(USER_ID, { type: 'start' });
    }
  });

  // Initialize the room
  room.message(USER_ID, { type: 'start' });
}); 
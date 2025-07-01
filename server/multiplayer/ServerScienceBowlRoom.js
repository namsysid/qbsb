import ServerPlayer from './ServerPlayer.js';
import Votekick from './VoteKick.js';
import { HEADER, ENDC, OKCYAN, OKBLUE } from '../bcolors.js';
import isAppropriateString from '../moderation/is-appropriate-string.js';
import { MODE_ENUM } from '../../quizbowl/constants.js';
import ScienceBowlRoom from '../../client/singleplayer/ScienceBowlRoom.js';
import RateLimit from '../RateLimit.js';
import getRandomScienceBowlQuestions from '../../database/science-bowl/get-query.js';
import ScienceBowlCategoryManager from '../../quizbowl/ScienceBowlCategoryManager.js';
import answerValidator from '../../client/singleplayer/science-bowl/answer-validator.js';

export default class ServerScienceBowlRoom extends ScienceBowlRoom {
  constructor(name, ownerId, isPermanent = false, subjects = []) {
    super(name, subjects);
    this.ownerId = ownerId;
    this.isPermanent = isPermanent;
    this.getRandomQuestions = getRandomScienceBowlQuestions;
    this.categoryManager = new ScienceBowlCategoryManager(subjects);
    this.bannedUserList = new Map();
    this.kickedUserList = new Map();
    this.votekickList = [];
    this.lastVotekickTime = {};
    this.rateLimiter = new RateLimit(50, 1000);
    this.rateLimitExceeded = new Set();
    this.settings = {
      ...this.settings,
      lock: false,
      loginRequired: false,
      public: true,
      controlled: false
    };
    setInterval(this.cleanupExpiredBansAndKicks.bind(this), 5 * 60 * 1000);
  }

  async message(userId, message) {
    switch (message.type) {
      case 'ban': return this.ban(userId, message);
      case 'chat': return this.chat(userId, message);
      case 'chat-live-update': return this.chatLiveUpdate(userId, message);
      case 'give-answer-live-update': return this.giveAnswerLiveUpdate(userId, message);
      case 'toggle-controlled': return this.toggleControlled(userId, message);
      case 'toggle-lock': return this.toggleLock(userId, message);
      case 'toggle-login-required': return this.toggleLoginRequired(userId, message);
      case 'toggle-mute': return this.toggleMute(userId, message);
      case 'toggle-public': return this.togglePublic(userId, message);
      case 'votekick-init': return this.votekickInit(userId, message);
      case 'votekick-vote': return this.votekickVote(userId, message);
      default: super.message(userId, message);
    }
  }

  // The rest of the multiplayer logic (ban, chat, connection, etc.) can be copied from ServerTossupRoom and adapted as needed.
  // ...
} 
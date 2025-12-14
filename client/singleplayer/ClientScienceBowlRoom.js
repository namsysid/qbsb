import api from '../scripts/api/index.js';
import ScienceBowlRoom from './ScienceBowlRoom.js';

let starredQuestionIds = null;
async function getRandomStarredQuestion() {
  if (starredQuestionIds === null) {
    starredQuestionIds = await fetch('/auth/stars/science-bowl-ids')
      .then(response => {
        if (!response.ok) { return null; }
        return response.json();
      });

    if (starredQuestionIds === null) { return null; }

    // random shuffle
    starredQuestionIds.sort(() => Math.random() - 0.5);
  }

  if (starredQuestionIds.length === 0) { return null; }

  const _id = starredQuestionIds.pop();
  return await api.getScienceBowlQuestionById(_id);
}

export default class ClientScienceBowlRoom extends ScienceBowlRoom {
  constructor(name = 'science-bowl') {
    console.log('ClientScienceBowlRoom: Constructor called');
    super(name);
    console.log('ClientScienceBowlRoom: Super constructor called');

    this.settings = {
      ...this.settings,
      aiMode: false
    };

    this.checkAnswer = api.checkAnswer;
    this.getRandomQuestions = async (args = {}) => {
      const subjectFilter = Array.isArray(args.subjects)
        ? args.subjects
        : Array.isArray(args.categories)
          ? args.categories
          : this.query.subjects;
      const competitionFilter = Array.isArray(args.competitions)
        ? args.competitions
        : this.query.competitions;
      const yearFilter = Array.isArray(args.years) ? args.years : this.query.years;
      const isMcq = typeof args.isMcq === 'boolean' ? args.isMcq : this.query.isMcq;
      const isTossup = typeof args.isTossup === 'boolean' ? args.isTossup : this.query.isTossup;
      const number = typeof args.number === 'number'
        ? args.number
        : (typeof this.query.number === 'number' ? this.query.number : 1);

      const query = {
        subjects: subjectFilter,
        competitions: competitionFilter,
        years: yearFilter,
        isMcq,
        isTossup,
        number
      };

      console.log('ClientScienceBowlRoom: Sending query to API:', query);
      const questions = await api.getRandomScienceBowlQuestion(query);
      console.log('ClientScienceBowlRoom: Received questions from API:', questions);
      
      // Map is_tossup from database to isTossup for our application
      return questions.map(question => ({
        ...question,
        isTossup: typeof question.isTossup === 'boolean'
          ? question.isTossup
          : (question.is_tossup === true || question.is_tossup === 1)
      }));
    };
    this.getRandomStarredQuestion = getRandomStarredQuestion;
    this.getSet = async ({ setName, packetNumbers }) => setName ? await api.getPacketScienceBowlQuestions(setName, packetNumbers[0] ?? 1) : [];
    this.getSetList = api.getSetList;
    this.getNumPackets = api.getNumPackets;
    console.log('ClientScienceBowlRoom: Constructor completed');
  }

  async message(userId, message) {
    console.log('ClientScienceBowlRoom received message:', message);
    switch (message.type) {
      case 'toggle-ai-mode': return this.toggleAiMode(userId, message);
      case 'start': 
        console.log('ClientScienceBowlRoom: Handling start message');
        const startResult = await super.message(userId, message);
        console.log('ClientScienceBowlRoom: Start message handled, result:', startResult);
        if (startResult && typeof startResult.isTossup === 'boolean') {
          console.log('ClientScienceBowlRoom: Storing isTossup:', startResult.isTossup);
          this.tossup = { ...this.tossup, isTossup: startResult.isTossup };
        }
        return startResult;
      default: 
        console.log('ClientScienceBowlRoom: Forwarding message to parent class');
        const defaultResult = await super.message(userId, message);
        console.log('ClientScienceBowlRoom: Parent class returned:', defaultResult);
        return defaultResult;
    }
  }

  toggleAiMode(userId, { aiMode }) {
    this.settings.aiMode = aiMode;
    this.emitMessage({ type: 'toggle-ai-mode', aiMode, userId });
  }
} 

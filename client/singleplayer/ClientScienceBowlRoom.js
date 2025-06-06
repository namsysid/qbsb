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
    super(name);

    this.settings = {
      ...this.settings,
      aiMode: false
    };

    this.checkAnswer = api.checkAnswer;
    this.getRandomQuestions = async (args) => await api.getRandomScienceBowlQuestion({ ...args, subjects: this.query.subjects });
    this.getRandomStarredQuestion = getRandomStarredQuestion;
    this.getSet = async ({ setName, packetNumbers }) => setName ? await api.getPacketScienceBowlQuestions(setName, packetNumbers[0] ?? 1) : [];
    this.getSetList = api.getSetList;
    this.getNumPackets = api.getNumPackets;
  }

  async message(userId, message) {
    switch (message.type) {
      case 'toggle-ai-mode': return this.toggleAiMode(userId, message);
      default: super.message(userId, message);
    }
  }

  toggleAiMode(userId, { aiMode }) {
    this.settings.aiMode = aiMode;
    this.emitMessage({ type: 'toggle-ai-mode', aiMode, userId });
  }
} 
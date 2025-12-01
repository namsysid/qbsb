import checkAnswer from 'https://cdn.jsdelivr.net/npm/qb-answer-checker@1.1.7/dist/main.mjs';
import filterParams from '../utilities/filter-params.js';

export default class api {
  /**
   * @param {string} answerline
   * @param {string} givenAnswer
   * @returns {Promise<{
    * directive: "accept" | "prompt" | "reject",
    * directedPrompt: String | null
  * }>}
  */
  static checkAnswer (answerline, givenAnswer, strictness = 7) {
    return checkAnswer(answerline, givenAnswer, strictness);
  }

  static async getBonusById (_id) {
    return await fetch('/api/bonus-by-id?' + new URLSearchParams({ id: _id }))
      .then(response => response.json())
      .then(data => data.bonus);
  }

  /**
   * @param {String} setName
   * @returns {Promise<Number>} The number of packets in the set.
   */
  static async getNumPackets (setName) {
    if (setName === undefined || setName === '') {
      return 0;
    }

    return await fetch('/api/num-packets?' + new URLSearchParams({ setName }))
      .then(response => response.json())
      .then(data => data.numPackets);
  }

  /**
   * @param {string} setName - The name of the set (e.g. "2021 ACF Fall").
   * @param {string | number} packetNumber - The packet number of the set.
   * @return {Promise<JSON[]>} An array containing the bonuses.
   */
  static async getPacketBonuses (setName, packetNumber) {
    if (setName === '') {
      return [];
    }

    return await fetch('/api/packet-bonuses?' + new URLSearchParams({ setName, packetNumber }))
      .then(response => response.json())
      .then(data => data.bonuses);
  }

  /**
   * @param {string} setName - The name of the set (e.g. "2021 ACF Fall").
   * @param {string} packetNumber - The packet number of the set.
   * @return {Promise<JSON[]>} An array containing the tossups.
   */
  static async getPacketTossups (setName, packetNumber) {
    if (setName === '') {
      return [];
    }

    return await fetch('/api/packet-tossups?' + new URLSearchParams({ setName, packetNumber }))
      .then(response => response.json())
      .then(data => data.tossups);
  }

  static async getRandomBonus ({ alternateSubcategories, categories, difficulties, maxYear, minYear, number, subcategories, threePartBonuses }) {
    const filteredParams = filterParams({ alternateSubcategories, categories, difficulties, maxYear, minYear, number, subcategories, threePartBonuses });
    return await fetch('/api/random-bonus?' + new URLSearchParams(filteredParams))
      .then(response => response.json())
      .then(response => response.bonuses);
  }

  static async getRandomTossup ({ alternateSubcategories, categories, difficulties, maxYear, minYear, number, powermarkOnly, standardOnly, subcategories }) {
    const filteredParams = filterParams({ alternateSubcategories, categories, difficulties, maxYear, minYear, number, powermarkOnly, standardOnly, subcategories });
    return await fetch('/api/random-tossup?' + new URLSearchParams(filteredParams))
      .then(response => response.json())
      .then(response => response.tossups);
  }

  static async getRandomScienceBowlQuestion ({ subjects, competitions, years, isMcq, isTossup, number }) {
    console.log('API Client: Raw parameters:', { subjects, competitions, years, isMcq, isTossup, number });
    const filteredParams = filterParams({ subjects, competitions, years, isMcq, isTossup, number });
    console.log('API Client: Filtered parameters:', filteredParams);
    const url = '/api/science-bowl/random-question?' + new URLSearchParams(filteredParams);
    console.log('API Client: Full URL:', url);
    return await fetch(url)
      .then(async response => {
        console.log('API Client: Response status:', response.status);
        if (!response.ok) {
          // If 404 or error, return empty array
          return [];
        }
        const data = await response.json();
        // If API returns {error: ...}, also return empty array
        if (!data || data.error) {
          return [];
        }
        // If API returns an array, return it
        if (Array.isArray(data)) {
          return data;
        }
        // If API returns {questions: [...]}, return the array
        if (data.questions && Array.isArray(data.questions)) {
          return data.questions;
        }
        // If API returns the array directly (current behavior)
        return data;
      });
  }

  static getSetList () {
    return api.SET_LIST;
  }

  static async getTossupById (_id) {
    return await fetch('/api/tossup-by-id?' + new URLSearchParams({ id: _id }))
      .then(response => response.json())
      .then(data => data.tossup);
  }

  static async getScienceBowlSubjectStats () {
    const parseResponse = async (response) => {
      const data = await response.json();
      return data.stats;
    };

    let response = await fetch('/auth/user-stats/science-bowl-subjects');
    if (response.ok) {
      return await parseResponse(response);
    }

    if (response.status === 401) {
      response = await fetch('/api/science-bowl/session-stats');
      if (response.ok) {
        return await parseResponse(response);
      }
    }

    throw new Error('Failed to fetch stats');
  }
}

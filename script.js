/* globals bootstrap */

import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit-html@3/directives/unsafe-html.js";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { gemini } from "https://cdn.jsdelivr.net/npm/asyncllm@2/dist/gemini.js";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";
import { marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";

const $transcriptForm = document.getElementById("transcript-form");
const $resultsPage = document.getElementById("results-page");
const $results = document.getElementById("results");
const $answersPage = document.getElementById("answers-page");
const $answers = document.getElementById("answers");
const $youtubePlayerContainer = document.getElementById("youtube-player-container");
const transcripts = {};
let player;
let playlist;

const loading = (message) => html`<div class="d-flex justify-content-center align-items-center my-5">
  <div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>
  <div class="ms-3 h4">${message}</div>
</div>`;

/**
 * Extracts YouTube video ID from filename
 * @param {string} filename - Name of file to extract ID from
 * @returns {string|null} - Extracted YouTube video ID or null if not found
 */
function extractYouTubeVideoID(filename) {
  // YouTube video IDs are 11 characters alphanumeric + - _
  const videoIDPattern = /\b[A-Za-z0-9_-]{11}\b/g;
  const matches = filename.match(videoIDPattern);
  return matches && matches.length > 0 ? matches[0] : null;
}

/**
 * Reads file contents and stores in transcripts object
 * @param {FileList} files - Selected files to process
 * @returns {Promise<void>}
 */
const uploadTranscript = async (files) => {
  for (const file of files) {
    const text = await file.text();
    transcripts[file.name] = text;
  }
  renderForm();
};

/**
 * Deletes transcript and updates view
 * @param {string} filename - Name of file to delete
 */
const deleteTranscript = (filename) => {
  delete transcripts[filename];
  renderForm();
};

/**
 * Creates a single string from all transcripts
 * @returns {string} - Concatenated string of all transcripts
 */
function allTranscriptText() {
  const result = [];
  for (const [filename, transcript] of Object.entries(transcripts)) {
    const videoID = extractYouTubeVideoID(filename);
    if (!videoID) continue;
    result.push(`# Video ID: ${videoID}\n\n${transcript}\n`);
  }
  return result.join("\n\n---\n\n");
}

/**
 * Renders transcript form with file list
 */
const renderForm = () => {
  const template = html`
    <div class="mb-3 d-flex justify-content-between align-items-center">
      <label class="btn btn-primary">
        <i class="bi bi-plus-circle me-2"></i>Add Transcript
        <input
          type="file"
          multiple
          accept=".txt, .srt, .vtt, .text, *.lrc, *.tsv"
          class="d-none"
          @change=${(e) => uploadTranscript(e.target.files)}
        />
      </label>

      ${Object.keys(transcripts).length > 0
        ? html`
            <button type="button" class="btn btn-success" @click=${renderOverview}>
              <i class="bi bi-chat-text me-2"></i>Chat with Video
            </button>
          `
        : ""}
    </div>

    <ul class="list-group">
      ${Object.keys(transcripts).map(
        (filename) => html`
          <li class="list-group-item d-flex justify-content-between align-items-center">
            <a href="https://www.youtube.com/watch?v=${extractYouTubeVideoID(filename)}">${filename}</a>
            <button type="button" class="btn btn-link text-danger" @click=${() => deleteTranscript(filename)}>
              <i class="bi bi-trash"></i>
            </button>
          </li>
        `
      )}
    </ul>
  `;

  render(template, $transcriptForm);
};

/**
 * Summarizes transcripts, identifies questions, and renders them
 */
async function renderOverview() {
  const url = "https://llmfoundry.straive.com/gemini/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse";
  showPage("results");
  render(html`<div class="my-5">${loading("Summarizing videos...")}</div>`, $results);

  for await (const { content } of asyncLLM(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(
      gemini({
        model: "gemini-1.5-flash-latest",
        stream: true,
        messages: [
          {
            role: "system",
            content: `You are a video transcript analyzer.
First, give an overview of what the transcripts are about to a lay audience in one short paragraph.
Then list 5 SHORT questions (without timestamps) answerable from SPECIFIC video segments RELEVANT for lay businessmen.
Pick from different parts of the video.
`,
          },
          { role: "user", content: allTranscriptText() },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            schema: {
              type: "object",
              properties: {
                overview: { type: "string" },
                questions: { type: "array", items: { type: "string" } },
              },
              required: ["overview", "questions"],
              additionalProperties: false,
            },
          },
        },
      })
    ),
  })) {
    if (!content) continue;
    const { overview, questions } = parse(content);
    render(
      html`
        ${overview ? html`<blockquote class="blockquote">${unsafeHTML(marked.parse(overview))}</blockquote>` : null}

        <form class="my-3" @submit=${answerQuestion}>
          <div class="input-group">
            <input
              type="text"
              name="question"
              class="form-control"
              placeholder="Ask a question about the video"
              required
            />
            <button type="submit" class="btn btn-primary"><i class="bi bi-send-fill me-2"></i>Ask</button>
          </div>
        </form>

        ${questions?.length > 0
          ? html`<div class="list-group my-3">
              ${questions.map(
                (question) =>
                  html`<button
                    type="button"
                    class="list-group-item list-group-item-action question"
                    @click=${() => answerQuestion(question)}
                  >
                    ${unsafeHTML(marked.parse(question))}
                  </button>`
              )}
            </div>`
          : null}
      `,
      $results
    );
  }
}

/**
 * Handles question submission and response
 * @param {string|Event} questionOrEvent - Question text or form submit event
 */
const answerQuestion = async (questionOrEvent) => {
  let question;

  if (typeof questionOrEvent === "string") question = questionOrEvent;
  else {
    questionOrEvent.preventDefault();
    const form = questionOrEvent.target;
    question = form.querySelector("input").value.trim();
    form.reset();
  }

  if (!question) return;

  showPage("answers");
  render(loading("Analyzing the videos..."), $answers);

  const url = "https://llmfoundry.straive.com/gemini/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse";
  for await (const { content } of asyncLLM(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(
      gemini({
        model: "gemini-1.5-flash-latest",
        stream: true,
        messages: [
          {
            role: "system",
            content: `Answer the user question from these transcripts as a set of logically sequenced sentences with video citations.
Answer very crisply. Keep each video clip to less than 4 lines (30 seconds).
Each answer should make sense as an independently understandable sentence.
`,
          },
          { role: "user", content: allTranscriptText() },
          { role: "user", content: question },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            schema: {
              type: "object",
              properties: {
                answers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      answer: { type: "string", description: "A sentence that is part of the answer." },
                      videoId: { type: "string", description: "YouTube Video ID" },
                      start: { type: "string", description: "HH:MM:SS" },
                      end: { type: "string", description: "HH:MM:SS" },
                    },
                    required: ["answer", "videoId", "start", "end"],
                  },
                },
              },
              required: ["answers"],
            },
          },
        },
      })
    ),
  })) {
    if (!content) continue;
    const { answers } = parse(content);
    if (!answers || !answers.length) continue;
    answers.forEach((answer) => {
      answer.startSeconds = timeToSeconds(answer.start);
      answer.endSeconds = timeToSeconds(answer.end);
      const duration = answer.endSeconds - answer.startSeconds;
      if (!isNaN(duration)) answer.duration = duration;
    });
    // Filter out answers that are too short or too long
    playlist = answers.filter(({ duration }) => duration > 0 && duration < 600);
    renderAnswers(question, true);
  }
  renderAnswers(question, false);
  if (playlist.length) playVideo(0);
};

/**
 * Converts time string to seconds (HH:MM:SS, MM:SS, or SS)
 * @param {string} time - Time string
 * @returns {number} Total seconds or NaN if invalid
 */
function timeToSeconds(time) {
  const [h = 0, m = 0, s = 0] = ("00:00:" + time).split(":").map(Number).slice(-3);
  // It's unlikely that the video is longer than 3 hours. Treat it as minutes and seconds if so.
  return h < 3 ? h * 3600 + m * 60 + s : h * 60 + m + s / 1000;
}

/**
 * Renders answers to the page
 * @param {Array<{answer: string, videoId: string, start: string, end: string}>} answers
 */
function renderAnswers(question, isLoading) {
  const totalSeconds = playlist.reduce((acc, { duration }) => acc + duration, 0);
  render(
    html`<h1 class="display-6 my-5">
        ${question} <small class="duration">${Math.floor(totalSeconds / 60)}m ${Math.round(totalSeconds % 60)}s</small>
      </h1>
      <div class="list-group">
        ${playlist.map(
          ({ answer, startSeconds, endSeconds }, index) =>
            html`<button
              type="button"
              data-index="${index}"
              class="answer list-group-item list-group-item-action fw-light h4 mb-0 py-3"
              @click="${() => playVideo(index)}"
            >
              ${answer} <small class="duration">${Math.round(endSeconds - startSeconds, 0)}s</small>
            </button>`
        )}
        ${isLoading ? html`<div class="list-group-item">${loading("Creating videos...")}</div>` : null}
      </div> `,
    $answers
  );
}

/**
 * Initializes YouTube player. Plays next video when current one ends.
 */
const $youtubeScript = document.createElement("script");
$youtubeScript.src = "https://www.youtube.com/iframe_api";
const $firstScript = document.getElementsByTagName("script")[0];
$firstScript.parentNode.insertBefore($youtubeScript, $firstScript);
let nextVideoQueued = false;
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player("youtube-player", {
    height: "360",
    width: "640",
    videoId: "",
    playerVars: { autoplay: 0, controls: 1, rel: 0 },
    events: {
      onReady: (event) => event.target.playVideo(),
      onStateChange: (event) => {
        if (event.data == YT.PlayerState.PLAYING) nextVideoQueued = false;
        if (event.data === YT.PlayerState.ENDED && !nextVideoQueued) {
          nextVideoQueued = true;
          playNextVideo();
        }
      },
    },
  });
};

let currentIndex;

function playVideo(index) {
  $youtubePlayerContainer.classList.remove("d-none");

  // Highlight the answer and unhighlight the rest
  $answers.querySelectorAll(".answer").forEach((el) => el.classList.toggle("active", +el.dataset.index === index));

  // Scroll active answer to center of viewport
  const activeAnswer = $answers.querySelector(".answer.active");
  if (activeAnswer) {
    const answerRect = activeAnswer.getBoundingClientRect();
    const scrollTop = window.scrollY + answerRect.top - (window.innerHeight - answerRect.height) / 2;
    $answers.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: scrollTop, behavior: "smooth" });
  }

  // Play the video
  const { videoId, startSeconds, endSeconds } = playlist[index];
  player.loadVideoById({ videoId, startSeconds, endSeconds });
  currentIndex = index;
}

function playNextVideo() {
  if (currentIndex < playlist.length - 1) playVideo(currentIndex + 1);
  else console.log("All videos played.");
}

/**
 * Shows a page and scrolls to the top
 * @param {string} page - Page to show
 */
function showPage(page) {
  document.body.dataset.show = page;
  window.scrollTo(0, 0);
}

// Add event listener near the initial DOM queries
$resultsPage.querySelector(".btn-close").addEventListener("click", () => showPage("setup"));
$answersPage.querySelector(".btn-close").addEventListener("click", () => {
  showPage("results");
  player.stopVideo();
});

// Initial render
renderForm();

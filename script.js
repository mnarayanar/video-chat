/* globals bootstrap */

import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit-html@3/directives/unsafe-html.js";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { gemini } from "https://cdn.jsdelivr.net/npm/asyncllm@2/dist/gemini.js";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";
import { marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";

const $demos = document.querySelector("#demos");
const $login = document.getElementById("login");
const $transcriptForm = document.getElementById("transcript-form");
const $resultsPage = document.getElementById("results-page");
const $results = document.getElementById("results");
const $answersPage = document.getElementById("answers-page");
const $answers = document.getElementById("answers");
const $youtubePlayerContainer = document.getElementById(
  "youtube-player-container"
);
const $ttsAudio = document.getElementById("tts-audio");
const transcripts = {};
let player;
let playlist;

const { token } = await fetch("https://llmfoundry.straive.com/token", {
  credentials: "include",
}).then((r) => r.json());
if (!token) {
  $login.href =
    "https://llmfoundry.straive.com/login?" +
    new URLSearchParams({ next: window.location.href });
  $login.classList.remove("d-none");
}

const loading = (message) =>
  html`<div class="d-flex justify-content-center align-items-center my-5">
    <div class="spinner-border" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
    <div class="ms-3 h4">${message}</div>
  </div>`;

render(loading("Loading demos..."), $demos);
fetch("config.json")
  .then((res) => res.json())
  .then(({ demos }) =>
    render(
      [
        demos.map(
          ({ title, body, transcripts }) => html`
            <div class="col py-3">
              <a
                class="demo card h-100 text-decoration-none"
                href="#"
                data-transcripts=${JSON.stringify(transcripts)}
              >
                <div class="card-body">
                  <h5 class="card-title">${title}</h5>
                  <p class="card-text">${body}</p>
                </div>
              </a>
            </div>
          `
        ),
      ],
      $demos
    )
  );

/**
 * Extracts YouTube video ID from filename
 * @param {string} filename - Name of file to extract ID from
 * @returns {string|null} - Extracted YouTube video ID or null if not found
 */
function extractYouTubeVideoID(filename) {
  // YouTube video IDs are 11 characters alphanumeric + - _ enclosed in square brackets
  const videoIDPattern = /\[[A-Za-z0-9_-]{11}\]/g;
  const matches = filename.match(videoIDPattern);
  return matches && matches.length > 0 ? matches[0].slice(1, -1) : null;
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
            <button
              type="button"
              class="btn btn-success"
              @click=${renderOverview}
            >
              <i class="bi bi-chat-text me-2"></i>Chat with Video
            </button>
          `
        : ""}
    </div>
    <div class="form-text mt-2">
      The filename must have the YouTube video ID in square brackets, e.g.
      [abcdef12345]
    </div>
     
    <ul class="list-group">
      ${Object.keys(transcripts).map(
        (filename) => html`
          <li
            class="list-group-item d-flex justify-content-between align-items-center"
          >
            <a
              href="https://www.youtube.com/watch?v=${extractYouTubeVideoID(
                filename
              )}"
              >${filename}</a
            >
            <button
              type="button"
              class="btn btn-link text-danger"
              @click=${() => deleteTranscript(filename)}
            >
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
  const url =
    "https://llmfoundry.straive.com/gemini/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse";
  showPage("results");
  render(
    html`<div class="my-5">${loading("Summarizing videos...")}</div>`,
    $results
  );

  for await (const { content } of asyncLLM(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}:videochat`,
    },
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
      html`<div class="d-flex gap-3">
        <div id="faq-container" class="flex-grow-1"></div>
        <div class="d-flex flex-column align-items-center"> <!-- Center align items -->
            <h1 class="text-center mb-4">Let's Get Started</h1> <!-- Centered with margin-bottom -->
            ${
              overview
                ? html`<blockquote class="blockquote">
                    ${unsafeHTML(marked.parse(overview))}
                  </blockquote>`
                : null
            }
            <!-- Thumbnails for YouTube videos -->
             <div class="container mt-5">
    <div class="carousel-container">
        <button class="carousel-button prev" id="prevBtn">&#10094;</button>
        <div class="d-flex gap-3 mb-4" id="videoCarousel">
            <!-- Video Thumbnails -->
            <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/BMsttQajzQ0/hqdefault.jpg" 
                     alt="Video 1 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()}/>
                <p class="video-title">Getting Started</p>
            </div>
            <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/BMsttQajzQ0/hqdefault.jpg" 
                     alt="Video 1 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()}/>
                <p class="video-title">Complete Homewrork</p>
            </div>
            <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/w5Iq-bQCvJ8/hqdefault.jpg" 
                     alt="Video 2 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()}/>    
                <p class="video-title">How to View Your Grades</p>
            </div>
            <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/0vA3OSbgrcU/hqdefault.jpg" 
                     alt="Video 3 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()} />
                <p class="video-title">How To Audio Record</p>
            </div>
            <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/U54kUt3xn4g/hqdefault.jpg" 
                     alt="Video 4 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()}/>
                <p class="video-title">How to Re-Use Your Course</p>
            </div>
            <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/pDrCABXiA7Y/hqdefault.jpg" 
                     alt="Video 5 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()} />
                <p class="video-title">How to Register for a ConnectMath Course</p>
            </div>
            <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/qaSLdOaJ6YU/hqdefault.jpg" 
                     alt="Video 6 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()} />
                <p class="video-title">How To: McGraw Hill Connect for Anatomy and Physiology</p>
            </div>
            <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/wyzxADSTYoM/hqdefault.jpg" 
                     alt="Video 7 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()} />
                <p class="video-title">How to Connect | Complete Assignments</p>
            </div>
            <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/22ms4fjkYNo/hqdefault.jpg" 
                     alt="Video 8 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()} />
                <p class="video-title">How to Connect | Student Support</p>
            </div>
             <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/YPVQYteywJ8/hqdefault.jpg" 
                     alt="Video 9 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()} />
                <p class="video-title">How to Connect for World Languages: Adaptive Learning Assignments</p>
            </div>
            <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/JP3HP29Z0Yo/hqdefault.jpg" 
                     alt="Video 10 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()} />
                <p class="video-title">Do College Smarter with Connect</p>
            </div>
            <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/q0r6DwVhm9Y/hqdefault.jpg" 
                     alt="Video 11 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()} />
                <p class="video-title">McGraw Hill Connect | Best Practices for Students</p>
            </div>
              <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/Vhu2WYfBssM/hqdefault.jpg" 
                     alt="Video 12 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()} />
                <p class="video-title">McGraw Hill Connect | How to Navigate Connect</p>
            </div>
                <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/xZYE37Jetjk/hqdefault.jpg" 
                     alt="Video 13 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()} />
                <p class="video-title">McGraw Hill Connect Math | Student Account</p>
            </div>
            <div class="video-thumbnail">
                <img src="https://img.youtube.com/vi/59hhh0FtmqY/hqdefault.jpg" 
                     alt="Video 14 Thumbnail" 
                     class="thumbnail" 
                      @click=${() => attachThumbnailEventListeners()} />
                <p class="video-title">What is Connect Master?</p>
            </div>
        </div>
        <span class="carousel-buttons" id="nextBtn">&gt;</span>
        <button class="carousel-button next" id="nextBtn">&#10095;</button>
    </div>
</div>


    
            <div class="blockquote-container d-flex flex-column justify-content-end">
                
                <form class="my-10 d-flex flex-column" @submit=${answerQuestion}>
                    <div class="input-group mb-3">
                        <input
                            type="text"
                            name="question"
                            class="form-control"
                            placeholder="Ask a question about the video" required/>
                        <button type="submit" class="btn btn-primary"><i class="bi bi-send-fill me-2"></i>Ask</button>
                    </div>
                    
                </form>
            </div>
        </div>
    </div>
    
    <!-- Modal for YouTube Video -->
    <div class="modal fade" id="videoModal" tabindex="-1" aria-labelledby="videoModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="videoModalLabel">Video</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <iframe id="videoFrame" width="100%" height="400" src="" frameborder="0" allowfullscreen></iframe>
          </div>
        </div>
      </div>
    </div>
    <footer class="my-3 vh-50 d-flex align-items-center justify-content-center">
            <h1 class="display-6">Designed by <a href="https://gramener.com/" class="text-reset link-offset-3 link-underline link-underline-opacity-25">Gramener</a></h1>
          </footer>
     `,
    
      $results
    );
    
    //youtube video crousal
    const videoCarousel = document.getElementById('videoCarousel');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    let currentIndex = 0;
    const videosToShow = 4;
    const totalVideos = videoCarousel.children.length;

    function updateCarousel() {
        for (let i = 0; i < totalVideos; i++) {
            videoCarousel.children[i].style.display = (i >= currentIndex && i < currentIndex + videosToShow) ? 'block' : 'none';
        }
    }

    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            updateCarousel();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentIndex < totalVideos - videosToShow) {
            currentIndex++;
            updateCarousel();
        }
    });

    updateCarousel(); // Initial call to display the first set of videos

   

    //function to open video in next page from thumbnail
    function attachThumbnailEventListeners() {
      const thumbnails = document.querySelectorAll(".video-thumbnail");
    
      thumbnails.forEach((thumbnail) => {
        thumbnail.addEventListener("click", function() {
          const videoTitleElement = this.querySelector(".video-title");
          if (videoTitleElement) {
            const videoTitle = videoTitleElement.textContent.trim(); // Get the title
            answerQuestion(videoTitle);
          } else {
            console.error("Video title element not found within the thumbnail.");
          }
        });
      });
    }
    /*// Function to open the modal and set the video source
    function openModal(videoId) {
      const videoFrame = document.getElementById('videoFrame');
      videoFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
      const videoModal = new bootstrap.Modal(document.getElementById('videoModal'));
      videoModal.show();
    }
    */
    // Function to reset the video source when the modal is closed
    document.getElementById('videoModal').addEventListener('hidden.bs.modal', function () {
      const videoFrame = document.getElementById('videoFrame');
      videoFrame.src = '';
    });
    const ques = {
      faq1: {
        
        "Connect for World Languages: Getting Started": "L1",
        "McGraw Hill Connect | Best Practices for Students": "L2",
        "Connect for World Languages: How To Audio Record": "L3",
        "Connect: How to View Your Grades": "L4",
        "Connect: Re-Using Your Course": "L5",
        "How to Register for a ConnectMath Course": "L6",
        "How To: McGraw Hill Connect for Anatomy and Physiology": "L7",
        "Connect | Completing Assignments": "L8",
        "Connect for World Languages: Complete Homework": "L9",
        "Connect for World Languages: Adaptive Learning Assignments": "L10",
        "Do College Smarter with Connect": "L11",
        "Connect | Student Support": "L12",
        "McGraw Hill Connect | How to Navigate Connect": "L13",
        "McGraw Hill Connect Math | Student Account": "L14",
        "What is Connect Master?": "L15",
      },
      L1: {
        "How can students access their to-do list with assignments and due dates in Connect?":
          null,
        "What information is displayed when selecting a specific assignment from the assignment section?":
          null,
        "How does the adaptive learning assignment adapt to a student's performance?":
          null,
        "What features are available in the Connect ebook for navigation and note-taking?":
          null,
        "How does Connect help improve students' learning performance beyond just homework assignments?":
          null,
          
      },
      L2: {
        "What is Connect, and how does it help students improve their grades?":
          null,
        "How can students register for Connect using their course syllabus?":
          null,
        "What are the different purchase options available for Connect?": null,
        "What is a recommended best practice for using Connect effectively according to the speaker?":
          null,
        "Who should students contact for tech support if they encounter issues with Connect?":
          null,
        
      
      },
      L3: {
        "What devices are compatible for completing recording activities in the Connect course?":
          null,
        "Which web browsers are recommended for completing activities on a PC or tablet?":
          null,
        "What steps should a student follow when starting their first recording exercise?":
          null,
        "What options are available after completing a recording for a speaking activity?":
          null,
        "How can students get support if they encounter issues with recording exercises?":
          null,
      },
      L4: {
        "How can students access their graded assignments and scores in Connect?":
          null,
        "What information is available for each assignment attempt on the Course Results page?":
          null,
        "How can students use assignment feedback as a study tool?": null,
        "What steps are required to navigate through assignment feedback and view correct answers?":
          null,
        "What insights can students gain from the Insight tool, and how can they track their progress?":
          null,
      },
      L5: {
        "What steps are involved in adding a blank section to a course in Connect?":
          null,
        
        "What is the process for updating due dates for assignments in a new term?":
          null,
        "How can instructors adjust registration dates to align with a new course section in Connect?":
          null,
      },
      L6: {
        "What website should you visit to register for the Connect Math course?":
          null,
        "What must you enter to enroll in the course after clicking 'Sign Up Now'?":
          null,
        "What should you do if the information displayed doesn't match the course you're trying to enroll in?":
          null,
        "How can you recover your login information if you've used Connect Math before but can't remember your details?":
          null,
        "Where can you manage all the classes you are enrolled in on Connect Math after completing the registration?":
          null,
      },
      L7: {
        "What tools are available to help students succeed in the Anatomy and Physiology course?":
          null,
        "How does LearnSmart Prep assist students in preparing for the Anatomy and Physiology course?":
          null,
        "What is Anatomy and Physiology Revealed (APR), and how can students use it?":
          null,
        "What can students do in Anatomy and Physiology Revealed (APR) once they access the application?":
          null,
        "Where can students find help videos if they get stuck while using Anatomy and Physiology Revealed?":
          null,
      },
      L8: {
        "What is the central topic or theme discussed in the video?": null,
        "How does the speaker explain the importance of completing assignments?":
          null,
        "What examples or case studies are provided to support the speaker's arguments?":
          null,
        "What are the key takeaways or lessons shared by the speaker?": null,
        "Did the speaker mention any tools, methods, or strategies? If so, what are they?":
          null,
      },
      L9: {
        
        "What information is displayed on the main screen after logging into the Connect course?":
        null,
      "How can a student check their answers and receive feedback when completing homework assignments?":
        null,
      },
      L10: {
        "What is the key topic or subject covered in the video?": null,
        "What step-by-step process does the speaker explain?": null,
        "What examples are provided to support the main points?": null,
        "How does the speaker address potential challenges or issues?": null,
        "What are the main takeaways or actionable insights from the video?":
          null,
      },
      L11: {
        "What is the main focus of the 'Do College Smarter with Connect' YouTube video?":
          null,
        "How does the video suggest students can improve their college experience?":
          null,
        "What specific tools or strategies are highlighted in the video for academic success?":
          null,
        "Are there any testimonials or success stories shared in the video?":
          null,
        "What is the intended audience for the 'Do College Smarter with Connect' video?":
          null,
      },
      L12: {
        "What is the primary topic discussed in the video?": null,
        "How does the speaker define or explain the key concept?": null,
        "What examples or real-life scenarios are mentioned?": null,
        "What challenges or common misconceptions are highlighted?": null,
        "What are the actionable tips or recommendations provided?": null,
      },
      L13: {
        "What does the course menu in Connect provide access to?": null,
        "How can you access your e-book on Connect?": null,
        "What is the Sharpen tool, and how is it related to Connect?": null,
        "What is the ReadAnywhere app, and what functionality does it provide?":
          null,
        "Where can students find additional tutorials on using Connect?": null,
      },
      L14: {
        "What options are available in the menu bar on the Connect math home page?":
          null,
        "How can you access your gradebook in Connect?": null,
        "What is SmartBook, and how does it help students in their course?":
          null,
        "Where can you purchase a loose-leaf version of your e-book?": null,
        "How can you update your account profile information in Connect?": null,
      },
      L15: {
        "What is the purpose of the adaptive learning program in Connect?":
          null,
        "How does the adaptive program provide additional resources to help students?":
          null,
        "How can you start an assignment in Connect, and what are the two options for beginning?":
          null,
        "Why is it important to be honest in your responses during the adaptive assignments?":
          null,
        "What are the two types of additional assignments mentioned, and how do they differ?":
          null,
      },
    };

    function FaqAccordion(uid, level = 1) {
      let accordion = "";

      if (uid && ques[uid]) {
        let item = "";

        for (let i in ques[uid]) {
          if (ques[uid][i]) {
            let accordionBody = FaqAccordion(ques[uid][i], level + 1);

            if (level === 1) {
              item += `<div class="accordion-item">`;
              item += `<h2 class="accordion-header">
                                  <button class="accordion-button h${level}" type="button" data-bs-toggle="collapse" data-bs-target="#${ques[uid][i]}" aria-expanded="false" aria-controls="${ques[uid][i]}">${i}</button>
                               </h2>`;
              item += `<div id="${ques[uid][i]}" class="accordion-collapse collapse" data-bs-parent="#${uid}">
                                  <div><ol>${accordionBody}</ol></div>
                               </div>`;
              item += `</div>`;
            } else {
              item += `<div class="sub-heading">${i}</div>`;
              item += accordionBody;
            }
          } else {
            // Add `data-question` to store the question text
            item += `<li><span class="faq" data-question="${i}">${i}</span></li>`;
          }
        }

        if (item !== "") accordion += item;
      }

      if (level === 1 && accordion !== "")
        return `<div class="accordion accordion-flush" id="${uid}">${accordion}</div>`;
      else return accordion;
    }

    // Function to attach event listeners to FAQ elements
    function attachFaqEventListeners() {
      document.querySelectorAll(".faq").forEach((faq) => {
        faq.addEventListener("click", function () {
          let question = this.getAttribute("data-question");
          if (question) {
            answerQuestion(question);
          }
        });
      });
    }

    // Render the FAQ accordion
    document.getElementById("faq-container").innerHTML = FaqAccordion(
      "faq1",
      1
    );

    // Attach event listeners AFTER rendering
    attachFaqEventListeners();
  }
}

const prompts = {
  originalAudio: `Answer the user question with engaging insights from these transcripts.
Frame the answer as logically sequenced sentences with video citations.
Each sentence should make full sense if read independently.
Cite the associated video ID, start and end times ONLY in the JSON fields, not in the answer. Convert start and end times to HH:MM:SS format.
Answer very crisply. Keep each video clip to less than 4 lines (30 seconds).
`,
  summaryAudio: `Answer the user question with engaging insights from these transcripts.
Answer as a series of very crisp sentences.
Cite the associated video ID, start and end times ONLY in the JSON fields, not in the answer. Convert start and end times to HH:MM:SS format.
Keep it to 3-5 sentences unless shorter or longer answers will be more appropriate.
Your sentences will be read out. Keep the tone simple and conversational. 
`,
};

const startingText = ["Let me check...", "I'll take a look...", "I'm on it..."];
const pollingText = [
  "A few more seconds...",
  "Almost there...",
  "Just a moment...",
];

/**
 * Returns true if the original audio button is active
 * @returns {boolean}
 */
const useOriginalAudio = () => {
  const result = $results
    .querySelector("#original-audio")
    ?.matches?.(".active");
  return result;
};

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

  // Play TTS audio while we're loading
  currentIndex = -1;
  playlist = [];
  let startedPlaying = false;
  playAudio(startingText[Math.floor(Math.random() * startingText.length)]);
  let polling = setInterval(() => {
    if (startedPlaying) return clearInterval(polling);
    if ($ttsAudio.ended)
      playAudio(pollingText[Math.floor(Math.random() * pollingText.length)]);
  }, 3000);

  const url =
    "https://llmfoundry.straive.com/gemini/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse";
  for await (const { content } of asyncLLM(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}:videochat`,
    },
    body: JSON.stringify(
      gemini({
        model: "gemini-1.5-flash-latest",
        stream: true,
        messages: [
          {
            role: "system",
            content: useOriginalAudio()
              ? prompts.originalAudio
              : prompts.summaryAudio,
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
                      answer: {
                        type: "string",
                        description: "A sentence that is part of the answer.",
                      },
                      videoId: {
                        type: "string",
                        description: "YouTube Video ID",
                      },
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

    playlist = answers;
    // Filter out answers that are too short or too long if we're using original audio
    if (useOriginalAudio())
      playlist = playlist.filter(
        ({ duration }) => duration > 0 && duration < 600
      );
    renderAnswers(question, true);

    // Start playing once the first video is complete and the second one has started - only if the TTS audio has ended
    if (!startedPlaying && playlist.length > 1) {
      startedPlaying = true;
      playVideo(0);
    }
  }
  renderAnswers(question, false);
  // If the answer has only 1 video, we wouldn't have started playing. So ...
  // Set startedPlaying (if it still hasn't started) to stop the polling
  startedPlaying = true;
  // Play any video if it exists
  if (!startedPlaying && playlist.length > 0) playVideo(0);
};

/**
 * Converts time string to seconds (HH:MM:SS, MM:SS, or SS)
 * @param {string} time - Time string
 * @returns {number} Total seconds or NaN if invalid
 */
function timeToSeconds(time) {
  const [h = 0, m = 0, s = 0] = ("00:00:" + time)
    .split(":")
    .map(Number)
    .slice(-3);
  // It's unlikely that the video is longer than 3 hours. Treat it as minutes and seconds if so.
  return h < 3 ? h * 3600 + m * 60 + s : h * 60 + m + s / 1000;
}

/**
 * Renders answers to the page
 * @param {Array<{answer: string, videoId: string, start: string, end: string}>} answers
 */
function renderAnswers(question, isLoading) {
  const totalSeconds = playlist.reduce(
    (acc, { duration }) => acc + duration,
    0
  );
  render(
    html`<h3 class="display-8 my-4">
        ${question}
        <small class="duration"
          >${Math.floor(totalSeconds / 60)}m
          ${Math.round(totalSeconds % 60)}s</small
        >
      </h3>
      <div class="list-group">
        ${playlist.map(
          ({ answer, videoId, start, startSeconds, endSeconds }, index) =>
            html`<button
              type="button"
              data-index="${index}"
              class="answer list-group-item list-group-item-action display-8 my-2 fw-light  mb-0 py-2"
              @click="${() => playVideo(index)}"
            >
              ${answer}
              <small class="duration"
                ></small
              >
            </button>
            `
            
        )}
        ${isLoading
          ? html`<div class="list-group-item ">
              ${loading("Creating videos...")}
            </div>`
          : null}
      </div>
      <footer class="my-5 vh-50 d-flex align-items-center justify-content-center">
            <h1 class="display-6">Designed by <a href="https://gramener.com/" class="text-reset link-offset-3 link-underline link-underline-opacity-25">Gramener</a></h1>
          </footer> `,
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
      onReady: (event) => {
        event.target.playVideo();
      },
      onStateChange: (event) => {
        // If we're using the original video's audio
        if (useOriginalAudio()) {
          // Unmute the video's audio
          event.target.unMute();
          // If the last video ended, play the next one (unless we already queued it)
          if (event.data === YT.PlayerState.ENDED && !nextVideoQueued) {
            nextVideoQueued = true;
            playNextVideo();
          }
          // Now that the video has started playing, clear the queued flag
          if (event.data == YT.PlayerState.PLAYING) nextVideoQueued = false;
        }
        // If we're not using original video's audio
        else {
          // Mute the video
          event.target.mute();
          // Use the YouTube player controls to control the TTS audio
          if (event.data === YT.PlayerState.PAUSED) $ttsAudio.pause();
          if (event.data === YT.PlayerState.PLAYING) $ttsAudio.play();
        }
      },
    },
  });
};

let currentIndex;

function playVideo(index) {
  $youtubePlayerContainer.classList.remove("d-none");

  // Highlight the answer and unhighlight the rest
  $answers
    .querySelectorAll(".answer")
    .forEach((el) =>
      el.classList.toggle("active", +el.dataset.index === index)
    );

  // Scroll active answer to center of viewport
  const activeAnswer = $answers.querySelector(".answer.active");
  if (activeAnswer) {
    const answerRect = activeAnswer.getBoundingClientRect();
    const scrollTop =
      window.scrollY +
      answerRect.top -
      (window.innerHeight - answerRect.height) / 2;
    $answers.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: scrollTop, behavior: "smooth" });
  }

  // Play the video
  const { answer, videoId, startSeconds, endSeconds } = playlist[index];
  player.loadVideoById({ videoId, startSeconds, endSeconds });
  // Play TTS audio if the original audio is not active
  if (!useOriginalAudio()) playAudio(answer);

  currentIndex = index;
}

function playAudio(text) {
  const params = new URLSearchParams({
    model: "tts-1",
    voice: "onyx",
    format: "mp3",
    input: text,
  });
  $ttsAudio.src = `https://llmfoundry.straive.com/openai/v1/audio/speech?${params.toString()}`;
  $ttsAudio.play();
}

$ttsAudio.addEventListener("ended", () => {
  if (!useOriginalAudio() && playlist.length > 0) playNextVideo();
});

function playNextVideo() {
  if (currentIndex < playlist.length - 1) playVideo(currentIndex + 1);
  else setTimeout(() => $answersPage.querySelector(".btn-close").click(), 2000);
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
$resultsPage
  .querySelector(".btn-close")
  .addEventListener("click", () => showPage("setup"));
$answersPage.querySelector(".btn-close").addEventListener("click", () => {
  showPage("results");
  $ttsAudio.pause();
  player.stopVideo();
  $results.querySelector("input[name=question]").focus();
});

// Initial render
renderForm();

$demos.addEventListener("click", async (e) => {
  const files = e.target.closest(".demo")?.dataset.transcripts;
  if (!files) return;

  e.preventDefault();
  render(loading("Loading transcripts..."), $transcriptForm);

  try {
    await Promise.all(
      JSON.parse(files).map(async (file) => {
        const res = await fetch(file);
        if (!res.ok) throw new Error(`Failed to load ${file}`);
        transcripts[file] = await res.text();
      })
    );
    // showPage('setup');
    renderOverview();
  } catch (err) {
    render(
      html`<div class="alert alert-danger">
        Failed to load: ${err.message}
      </div>`,
      $transcriptForm
    );
  }
});

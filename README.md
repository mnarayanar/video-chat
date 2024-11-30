# Incident Analysis Dashboard

Video Chat transforms long-form video content into an interactive knowledge base. Users upload video transcripts and engage in natural conversations with an AI that provides precise answers while citing relevant video segments. This is particularly valuable for businesses

- Extracting insights from customer interviews, training videos, conference recordings, stakeholder meetings, or incident reports
- Creating training summaries
- Building searchable video archives for compliance or knowledge management

## Features

- Interactive video transcript analysis using AI
- YouTube video integration with timestamp-based playback
- Text-to-speech narration with AI voice synthesis
- Dark/light theme support
- Responsive design for all screen sizes
- Private LLM integration with secure authentication
- Multi-transcript support with automatic video ID detection
- Smart question suggestions based on video content
- Timestamped video segment citations in answers

## Usage

1. Log in to LLM Foundry (if not already authenticated)
2. Click "Add Transcript" to upload one or more video transcripts (.txt, .srt, .vtt, etc.)
3. Click "Chat with Video" to analyze the transcripts
4. Either:
   - Ask your own question in the input field
   - Click one of the AI-suggested questions
5. Choose between original video audio or AI narration
6. View answers with timestamped video evidence
7. Click any answer to play the relevant video segment
8. Videos auto-play in sequence to show all evidence

## Setup

### Prerequisites

- Modern web browser with JavaScript enabled
- Access to LLM Foundation API endpoint
- YouTube API access (automatic)

### Local Setup

1. Clone the repository
2. Serve the files using any web server
3. Access index.html in your browser

## Technical Details

### Architecture

- Frontend-only application using vanilla JavaScript
- Streaming API responses for real-time updates
- Component-based UI using lit-html templating
- Bootstrap 5.3 for responsive layout
- YouTube IFrame API for video playback

### Dependencies

- [Bootstrap](https://www.npmjs.com/package/bootstrap) 5.3.3 - UI framework
- [lit-html](https://www.npmjs.com/package/lit-html) 3.0 - Template rendering
- [asyncllm](https://www.npmjs.com/package/asyncllm) 2.0 - LLM API integration
- [marked](https://www.npmjs.com/package/marked) 13.0 - Markdown parsing
- [partial-json](https://www.npmjs.com/package/partial-json) 0.1.7 - Streaming JSON parsing
- [bootstrap-icons](https://www.npmjs.com/package/bootstrap-icons) 1.11.3 - Icon set
- OpenAI TTS API - Text-to-speech synthesis

## License

[MIT](LICENSE)

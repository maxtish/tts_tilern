import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

app.use(express.static(path.join(process.cwd(), 'public')));

// Замените жесткие пути на переменные окружения или относительные пути
// Проверяем, запущен ли код в Docker или на Windows
const PIPER_EXE = process.platform === 'win32' ? 'C:\\piper\\piper.exe' : '/usr/bin/piper';

// Важно: в Docker (Linux) нам не нужен параметр cwd: 'C:\\piper'
const piperOptions = process.platform === 'win32' ? { shell: false, cwd: 'C:\\piper' } : { shell: false };
const MODELS_BASE_DIR = path.join(process.cwd(), 'models', 'de');

app.post('/tts', async (req, res) => {
  const { text, voice } = req.body;
  if (!text || !voice) return res.status(400).send('Missing params');

  const modelDir = path.join(MODELS_BASE_DIR, voice);
  const modelPath = path.join(modelDir, 'model.onnx');
  const configPath = path.join(modelDir, 'model.onnx.json');

  if (!fs.existsSync(modelPath)) return res.status(404).send('Model not found');

  let sampleRate = 16000;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    sampleRate = config.audio?.sample_rate || 16000;
  } catch (e) {}

  console.log(`Запрос: [${voice}] Текст: ${text.slice(0, 20)}...`);

  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
  });

  /// При запуске спавна для Linux cwd обычно не критичен, если piper в PATH
  const piper = spawn(PIPER_EXE, ['--model', modelPath, '--output_raw'], piperOptions);

  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-f',
      's16le',
      '-ar',
      sampleRate.toString(),
      '-ac',
      '1',
      '-i',
      'pipe:0',
      '-codec:a',
      'libmp3lame',
      '-b:a',
      '128k',
      '-f',
      'mp3',
      'pipe:1',
    ],
    { shell: false }
  );

  // Связка потоков
  piper.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);

  // Логируем ВСЁ из stderr в консоль сервера
  piper.stderr.on('data', (data) => console.log(`PIPER_LOG: ${data.toString()}`));
  ffmpeg.stderr.on('data', (data) => console.log(`FFMPEG_LOG: ${data.toString()}`));

  // Пишем текст
  piper.stdin.write(text);
  piper.stdin.end();

  piper.on('error', (err) => console.error('Ошибка Piper:', err));
  ffmpeg.on('error', (err) => console.error('Ошибка FFmpeg:', err));

  ffmpeg.on('close', (code, signal) => {
    console.log(`FFmpeg завершен. Код: ${code}, Сигнал: ${signal}`);
    res.end();
  });
});

app.listen(8400, '0.0.0.0', () => {
  console.log('Сервер: http://localhost:8400');
});

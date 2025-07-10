process.env.FFMPEG_PATH = require('ffmpeg-static');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Client, GatewayIntentBits, Events, messageLink, Guild } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require('@discordjs/voice');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const currentSentence = new Map();
const gameActive = new Map();
const playingaudio = new Map();
const startTime = new Map();
const inVC = new Map();
const connection = new Map();
const lastUsed = new Map();
const inactivityCall = new Map();
let globalLastUsed = 0;

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const guildId = message.guild.id;

  if (message.content.toLowerCase() === "*join") {
    if (inVC.get(guildId)) return message.reply('❗ I am already in a voice channel!');

    if (!message.member.voice.channel) return message.reply('❗ You must join a voice channel first!');

    joinVoiceChannel({
      channelId: message.member.voice.channel.id,
      guildId: message.guildId,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    inVC.set(guildId, true);
    lastUsed.set(guildId, Date.now());
    message.channel.send('🏁 Get ready to type! Run *startrace to start.');
  } else if (message.content.toLowerCase() === "*leave") {
      if (!inVC.get(guildId)) return message.reply('❗ I am not in a voice channel!');
      if (gameActive.get(guildId)) return message.reply('❗ There is an ongoing race!');
      leaveVC(message);
  } else if (message.content.toLowerCase() === '*startrace' && !gameActive.get(guildId)) {
      if (!message.member.voice.channel || !inVC.get(guildId))
        return message.reply('❗ Join a voice channel first then run *join.');

      const conn = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: guildId,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      connection.set(guildId, conn);
      const sentence = getRandomQuote();
      currentSentence.set(guildId, sentence);
      gameActive.set(guildId, true);
      message.channel.send('🎙️ Listen closely, the typing race is starting...');

      const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=Here is your sentence. ${encodeURIComponent(sentence)}. I will now repeat this sentence again. ${encodeURIComponent(sentence)}`;

      try {
        const response = await axios.get(ttsUrl, { responseType: 'stream' });
        const writer = fs.createWriteStream(path.join(__dirname, `${guildId}.mp3`));
        response.data.pipe(writer);

        writer.on('finish', () => {
          const player = createAudioPlayer();
          const resource = createAudioResource(path.join(__dirname, `${guildId}.mp3`));
          connection.get(guildId).subscribe(player);
          player.play(resource);
          playingaudio.set(guildId, true);

          player.on(AudioPlayerStatus.Idle, () => {
            message.channel.send('⌨️ Type the sentence you just heard — first to do it exactly wins!');
            playingaudio.set(guildId, false);
            startTime.set(guildId, Date.now());
          });
        });
      } catch (err) {
        console.error('TTS Error:', err);
        message.channel.send('⚠️ Failed to generate TTS audio.');
      }

      lastUsed.set(guildId, Date.now());
      globalLastUsed = Date.now();
  } else if (message.content.toLowerCase() === "*help") {
      console.log('help');
  } else if (
      message.content.toLowerCase() === '*repeat' &&
      gameActive.get(guildId) &&
      inVC.get(guildId) &&
      !playingaudio.get(guildId) &&
      connection.get(guildId)
  ) {
      try {
        const player = createAudioPlayer();
        const resource = createAudioResource(path.join(__dirname, `${guildId}.mp3`));
        connection.get(guildId).subscribe(player);
        player.play(resource);
        playingaudio.set(guildId, true);
        player.on(AudioPlayerStatus.Idle, () => playingaudio.set(guildId, false));
      } catch (err) {
        console.error('TTS Error:', err);
        message.channel.send('⚠️ Failed to repeat audio.');
      }
  } else if (
    gameActive.get(guildId) &&
    message.content.trim().toLowerCase() === 
    currentSentence.get(guildId)?.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"?<>@\[\]\\|+]/g, '')) {

      gameActive.set(guildId, false);
      lastUsed.set(guildId, Date.now());
      const endTime = Date.now();
      const timeTaken = ((endTime - startTime.get(guildId)) / 1000).toFixed(2);
      const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=Congrats ${message.author.displayName}, you won with a time of ${timeTaken} seconds!`;
      message.channel.send(`🏆 ${message.author.displayName} wins the typing race with a time of ${timeTaken} seconds!`);
      
      try {
        const response = await axios.get(ttsUrl, { responseType: 'stream' });
        const writer = fs.createWriteStream(path.join(__dirname, `${guildId}.mp3`));
        response.data.pipe(writer);

        writer.on('finish', () => {
          const player = createAudioPlayer();
          const resource = createAudioResource(path.join(__dirname, `${guildId}.mp3`));
          connection.get(guildId).subscribe(player);
          player.play(resource);
          playingaudio.set(guildId, true);
        });
    } catch (err) {
      console.error('TTS Error:', err);
    }
  }

  function inactivity() {
    if (!inVC.get(guildId)) return;
    
    const last = lastUsed.get(guildId);
    
    if (Date.now() - last > 175000) {
      message.channel.send('👋 Leaving due to inactivity.');
      leaveVC(message, true);
    }
  }

  inactivityCall.set(guildId, setInterval(inactivity, 180000));
});

function leaveVC(message, v=false) {
  const guildId = message.guild.id;

  try {
    const conn = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: guildId,
        adapterCreator: message.guild.voiceAdapterCreator,
      });
    if (conn)
    conn.destroy();

    connection.delete(guildId);
    inVC.delete(guildId);
    gameActive.delete(guildId);
    playingaudio.delete(guildId);
    currentSentence.delete(guildId);
    startTime.delete(guildId);
    lastUsed.delete(guildId);
    clearInterval(inactivityCall.get(guildId));
    inactivityCall.delete(guildId);

    fs.unlink(path.join(__dirname, `${guildId}.mp3`), (err) => {});

    if (!v) message.channel.send('👋 Left the voice channel.');
  } catch (err) {
    console.error('❌ Error in leaveVC:', err);
  }
}

function getRandomQuote() {
  try {
    const data = fs.readFileSync('quotes.txt', 'utf8');
    const lines = data.split('\n');
    const randomLine = lines[Math.floor(Math.random() * lines.length)];
    return randomLine.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"?<>@\[\]\\|+]/g, '');
  } catch (err) {
    console.error('❌ Error reading file:', err.message);
    return '⚠️ Could not read quotes file.';
  }
}

async function fetchAndSaveQuotes() {
  try {
    
    if (((Date.now() - globalLastUsed) > 60000) && globalLastUsed !== 0) return;

    const response = await axios.get('https://zenquotes.io/api/quotes');
    const quotes = response.data;
    const formatted = quotes.map(q => `${q.q}`).join('\n');
    fs.writeFileSync('quotes.txt', formatted);
    console.log(`✅ Saved ${quotes.length} quotes to quotes.txt`);
  } catch (error) {
    console.error('❌ Failed to fetch quotes:', error.message);
  }
}

setInterval(fetchAndSaveQuotes, 60000);
fetchAndSaveQuotes();

client.login(process.env.DISCORD_TOKEN);

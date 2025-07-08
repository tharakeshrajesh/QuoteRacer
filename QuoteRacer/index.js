require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Client, GatewayIntentBits, Events } = require('discord.js');
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

let currentSentence = '';
let gameActive = false;
let playingaudio = false;
let startTime = 0;
let inVC = false;
let connection;

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.toLowerCase() === "*join"){
    if (inVC)
      return message.reply('❗ I am already in a voice channel!')
    joinVoiceChannel({
      channelId: message.member.voice.channel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });
    inVC = true;
    message.channel.send('🏁 Get ready to type! Run *startrace to start.')
  } else if (message.content.toLowerCase() === "*leave"){
    if (!inVC)
      return message.reply('❗ I am not in a voice channel!')
    if (connection)
      connection.destroy();
      connection = null;
      message.channel.send('👋 Left the voice channel.');
    inVC = false;
    fs.unlink(path.join(__dirname, `${message.guild.id}.mp3`), (err) => {
      if (err)
        console.error('❌ Error deleting file:', err);
    });
  } else if (message.content.toLowerCase() === '*startrace' && !gameActive){
    
    if (!message.member.voice.channel || !inVC)
      return message.reply('❗ Join a voice channel first then run *join.');
  
    connection = joinVoiceChannel({
      channelId: message.member.voice.channel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    currentSentence = getRandomQuote();
    gameActive = true;
    message.channel.send('🎙️ Listen closely, the typing race is starting...');

    const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=Here is your sentence. ${encodeURIComponent(currentSentence)}`;

    try {
      const response = await axios.get(ttsUrl, { responseType: 'stream' });
      const writer = fs.createWriteStream(path.join(__dirname, `${message.guild.id}.mp3`));
      response.data.pipe(writer);

      writer.on('finish', () => {
        const player = createAudioPlayer();
        const resource = createAudioResource(path.join(__dirname, `${message.guild.id}.mp3`));
        connection.subscribe(player);
        player.play(resource);
        playingaudio = true;

        player.on(AudioPlayerStatus.Idle, () => {
          message.channel.send(
            '⌨️ Type the sentence you just heard — first to do it exactly wins!'
          );
          playingaudio = false;
          startTime = Date.now()
        });
      });
    } catch (err) {
      console.error('TTS Error:', err);
      message.channel.send('⚠️ Failed to generate TTS audio.');
    }
  } else if (message.content.toLowerCase() === "*help"){
      console.log('help');
  } else if (message.content.toLowerCase() === '*repeat' && gameActive && inVC && !playingaudio && connection) {
      try {
        const player = createAudioPlayer();
        const resource = createAudioResource(path.join(__dirname, `${message.guild.id}.mp3`));
        connection.subscribe(player);
        player.play(resource);
        playingaudio = true;
        player.on(AudioPlayerStatus.Idle, () => {playingaudio = false;})
      } catch (err) {
        console.error('TTS Error:', err);
        message.channel.send('⚠️ Failed to repeat audio.');
      }
  } else if (gameActive && message.content.trim().toLowerCase() === currentSentence.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"?<>@\[\]\\|+]/g, '')) {
    gameActive = false;
    const endTime = Date.now()
    const timeTaken = ((endTime - startTime) / 1000).toFixed(2).toString()
    message.channel.send(`🏆 ${message.author.displayName} wins the typing race with a time of ${timeTaken} seconds!`);

    const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=Congrats ${message.author.displayName}, you won with a time of ${timeTaken} seconds!`;
    try {
      const response = await axios.get(ttsUrl, { responseType: 'stream' });
      const writer = fs.createWriteStream(path.join(__dirname, `${message.guild.id}.mp3`));
      response.data.pipe(writer);

      writer.on('finish', () => {
        const player = createAudioPlayer();
        const resource = createAudioResource(path.join(__dirname, `${message.guild.id}.mp3`));
        connection.subscribe(player);
        player.play(resource);
        playingaudio = true;
      })
    } catch (err) {
      console.error('TTS Error:', err);
      message.channel.send('⚠️ Failed to generate TTS audio.');
    }
  }
});

function getRandomQuote() {
  try {
    const data = fs.readFileSync('quotes.txt', 'utf8');

    const lines = data.split('\n');

    const randomLine = lines[Math.floor(Math.random() * lines.length)];

    const cleanLine = randomLine.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"?<>@\[\]\\|+]/g, '');

    return cleanLine;
  } catch (err) {
    console.error('❌ Error reading file:', err.message);
    return '⚠️ Could not read quotes file.';
  }
}

async function fetchAndSaveQuotes() {
  try {
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


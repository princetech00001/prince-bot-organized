import axios from 'axios';
import FormData from 'form-data';
import * as cheerio from 'cheerio';

const EFFECT_URLS = {
    glitchtext: 'https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html',
    writetext: 'https://en.ephoto360.com/write-text-on-wet-glass-online-589.html',
    advancedglow: 'https://en.ephoto360.com/advanced-glow-effects-74.html',
    typographytext: 'https://en.ephoto360.com/create-typography-text-effect-on-pavement-online-774.html',
    pixelglitch: 'https://en.ephoto360.com/create-pixel-glitch-text-effect-online-769.html',
    neonglitch: 'https://en.ephoto360.com/create-impressive-neon-glitch-text-effects-online-768.html',
    flagtext: 'https://en.ephoto360.com/nigeria-3d-flag-text-effect-online-free-753.html',
    flag3dtext: 'https://en.ephoto360.com/free-online-american-flag-3d-text-effect-generator-725.html',
    deletingtext: 'https://en.ephoto360.com/create-eraser-deleting-text-effect-online-717.html',
    blackpinkstyle: 'https://en.ephoto360.com/online-blackpink-style-logo-maker-effect-711.html',
    glowingtext: 'https://en.ephoto360.com/create-glowing-text-effects-online-706.html',
    underwatertext: 'https://en.ephoto360.com/3d-underwater-text-effect-online-682.html',
    logomaker: 'https://en.ephoto360.com/free-bear-logo-maker-online-673.html',
    cartoonstyle: 'https://en.ephoto360.com/create-a-cartoon-style-graffiti-text-effect-online-668.html',
    papercutstyle: 'https://en.ephoto360.com/multicolor-3d-paper-cut-style-text-effect-658.html',
    watercolortext: 'https://en.ephoto360.com/create-a-watercolor-text-effect-online-655.html',
    effectclouds: 'https://en.ephoto360.com/write-text-effect-clouds-in-the-sky-online-619.html',
    blackpinklogo: 'https://en.ephoto360.com/create-blackpink-logo-online-free-607.html',
    gradienttext: 'https://en.ephoto360.com/create-3d-gradient-text-effect-online-600.html',
    summerbeach: 'https://en.ephoto360.com/write-in-sand-summer-beach-online-free-595.html',
    luxurygold: 'https://en.ephoto360.com/create-a-luxury-gold-text-effect-online-594.html',
    multicoloredneon: 'https://en.ephoto360.com/create-multicolored-neon-light-signatures-591.html',
    sandsummer: 'https://en.ephoto360.com/write-in-sand-summer-beach-online-576.html',
    galaxywallpaper: 'https://en.ephoto360.com/create-galaxy-wallpaper-mobile-online-528.html',
    '1917style': 'https://en.ephoto360.com/1917-style-text-effect-523.html',
    makingneon: 'https://en.ephoto360.com/making-neon-light-text-effect-with-galaxy-style-521.html',
    royaltext: 'https://en.ephoto360.com/royal-text-effect-online-free-471.html',
    freecreate: 'https://en.ephoto360.com/free-create-a-3d-hologram-text-effect-441.html',
    galaxystyle: 'https://en.ephoto360.com/create-galaxy-style-free-name-logo-438.html',
    amongustext: 'https://en.ephoto360.com/create-a-cover-image-for-the-game-among-us-online-762.html',
    rainytext: 'https://en.ephoto360.com/foggy-rainy-text-effect-75.html',
    lighteffects: 'https://en.ephoto360.com/light-effects-74.html'
};

async function ephoto(url, textInput) {
    const formData = new FormData();
    
    const initialResponse = await axios.get(url, {
        headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36'
        }
    });
    
    const $ = cheerio.load(initialResponse.data);
    
    const token = $('input[name=token]').val();
    const buildServer = $('input[name=build_server]').val();
    const buildServerId = $('input[name=build_server_id]').val();
    
    formData.append('text[]', textInput);
    formData.append('token', token);
    formData.append('build_server', buildServer);
    formData.append('build_server_id', buildServerId);
    
    const postResponse = await axios({
        url: url,
        method: 'POST',
        data: formData,
        headers: {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36',
            'cookie': initialResponse.headers['set-cookie']?.join('; '),
            ...formData.getHeaders()
        }
    });
    
    const $$ = cheerio.load(postResponse.data);
    const formValueInput = JSON.parse($$('input[name=form_value_input]').val());
    formValueInput['text[]'] = formValueInput.text;
    delete formValueInput.text;
    
    const { data: finalResponseData } = await axios.post('https://en.ephoto360.com/effect/create-image', new URLSearchParams(formValueInput), {
        headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36',
            'cookie': initialResponse.headers['set-cookie'].join('; ')
        }
    });
    
    return buildServer + finalResponseData.image;
}

export default {
    command: [
        'glitchtext', 'writetext', 'advancedglow', 'typographytext', 'pixelglitch',
        'neonglitch', 'flagtext', 'flag3dtext', 'deletingtext', 'blackpinkstyle',
        'glowingtext', 'underwatertext', 'logomaker', 'cartoonstyle', 'papercutstyle',
        'watercolortext', 'effectclouds', 'blackpinklogo', 'gradienttext', 'summerbeach',
        'luxurygold', 'multicoloredneon', 'sandsummer', 'galaxywallpaper', '1917style',
        'makingneon', 'royaltext', 'freecreate', 'galaxystyle', 'amongustext',
        'rainytext', 'lighteffects', 'ephoto'
    ],
    category: 'ephoto',
    description: 'Create cool text effects with various styles',
    
    run: async ({ sock, msg, from, body, prefix = "." }) => {
        
        let text = "";
        if (msg.message?.conversation) {
            text = msg.message.conversation;
        } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text;
        } else if (body) {
            text = body;
        }
        text = text.trim();
        
        const commandMatch = text.match(new RegExp(`^${prefix}(\\w+)`));
        const command = commandMatch ? commandMatch[1].toLowerCase() : '';
        
        const inputText = text.replace(new RegExp(`^${prefix}${command}\\s*`, 'i'), "").trim();
        
        if (command === 'ephoto') {
            const effectList = Object.keys(EFFECT_URLS).map(e => `• ${prefix}${e}`).join('\n');
            return sock.sendMessage(from, {
                text: `🎨 *EPHOTO EFFECTS*\n\nCreate cool text effects!\n\n📋 *EFFECT LIST:*\n${effectList}\n\nExample: ${prefix}glitchtext Hello`
            }, { quoted: msg });
        }
        
        if (!inputText) {
            return sock.sendMessage(from, {
                text: `❌ Error\n\nEnter text!\nExample: ${prefix}${command} Hello World`
            }, { quoted: msg });
        }
        
        const effectUrl = EFFECT_URLS[command];
        if (!effectUrl) {
            return sock.sendMessage(from, {
                text: `❌ Effect not found\n\nUse ${prefix}ephoto to see the list`
            }, { quoted: msg });
        }
        
        await sock.sendMessage(from, {
            text: `🕐 Creating *${command}* effect...`
        }, { quoted: msg });
        
        try {
            const imageUrl = await ephoto(effectUrl, inputText);
            
            await sock.sendMessage(from, {
                image: { url: imageUrl },
                caption: `✅ *${command}* effect created!\n\nText: ${inputText}`
            }, { quoted: msg });
            
        } catch (error) {
            console.error("Ephoto error:", error);
            await sock.sendMessage(from, {
                text: `❌ Failed to create effect\n\nError: ${error.message}`
            }, { quoted: msg });
        }
    }
};

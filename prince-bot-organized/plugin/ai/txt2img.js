import axios from 'axios';

const STYLES = ['photorealistic', 'digital-art', 'impressionist', 'anime', 'fantasy', 'sci-fi', 'vintage'];

export default {
    command: ['txt2img', 'texttoimage', 't2i', 'imagine'],
    category: 'ai',
    description: 'Generate images from text with AI',
    usage: '.txt2img <prompt> | <style>',
    
    run: async ({ sock, msg, from, body, prefix = "." }) => {
        
        let text = "";
        if (body) {
            text = body;
        } else if (msg.message?.conversation) {
            text = msg.message.conversation;
        } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text;
        }
        text = text.trim();
        
        // Remove command to get input
        const input = text.replace(new RegExp(`^${prefix}(txt2img|texttoimage|t2i|imagine)\\s*`, 'i'), "").trim();
        
        if (!input) {
            return sock.sendMessage(from, {
                text: `🎨 *TEXT TO IMAGE*\n\nGenerate images from text with AI\n\n*Usage:* ${prefix}txt2img <prompt> | <style>\n\n*Example:* ${prefix}txt2img beautiful sunset | anime\n\n🎭 *STYLES:*\n${STYLES.join(', ')}`
            }, { quoted: msg });
        }
        
        await sock.sendMessage(from, { text: "🕐 Generating image..." }, { quoted: msg });
        
        const [prompt, styleInput] = input.split('|').map(s => s.trim());
        const style = STYLES.includes(styleInput) ? styleInput : 'anime';
        
        try {
            // Using Pollinations AI (free, no API key needed)
            const encodedPrompt = encodeURIComponent(prompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${Date.now()}&enhance=true`;
            
            await sock.sendMessage(from, {
                image: { url: imageUrl },
                caption: `🎨 *Generated Image*\n\n📝 Prompt: ${prompt}\n🎨 Style: ${style}\n\n✨ Powered by AI`
            }, { quoted: msg });
            
        } catch (error) {
            console.error("Image generation error:", error);
            
            // Fallback to another API
            try {
                const fallbackUrl = `https://api.davidcyriltech.my.id/ai/text2img?text=${encodeURIComponent(prompt)}`;
                const response = await axios.get(fallbackUrl, { timeout: 60000 });
                
                if (response.data?.imageUrl || response.data?.url) {
                    await sock.sendMessage(from, {
                        image: { url: response.data.imageUrl || response.data.url },
                        caption: `🎨 *Generated Image*\n\n📝 Prompt: ${prompt}\n🎨 Style: ${style}`
                    }, { quoted: msg });
                } else {
                    throw new Error("No image URL in response");
                }
                
            } catch (e) {
                await sock.sendMessage(from, { 
                    text: `❌ Failed to generate image\n\nError: ${error.message}\n\nTry again later!` 
                }, { quoted: msg });
            }
        }
    }
};

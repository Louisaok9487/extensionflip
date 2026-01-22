const API_KEY = 'YOUR_API';
const MODEL = 'gemini-3-pro-preview'; 
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

document.getElementById('evaluate-btn').addEventListener('click', async () => {
    const resultDiv = document.getElementById('result');
    const alertDiv = document.getElementById('seller-alert'); // 現在已存在
    const previewDiv = document.getElementById('preview-container'); // 現在已存在
    const btn = document.getElementById('evaluate-btn');
    
    // 初始化 UI
    previewDiv.innerHTML = "";
    alertDiv.style.display = "none";
    resultDiv.innerHTML = `<ul id="progress-list"></ul><div id="status-text">⏳ 初始化中...</div>`;
    const progressList = document.getElementById('progress-list');
    const statusText = document.getElementById('status-text');
    btn.disabled = true;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        statusText.innerText = "⏳ 正在搜尋網頁圖片與賣家資訊...";
        const injection = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async () => {
                const text = document.body.innerText;
                const title = document.querySelector('h1')?.innerText || document.title;
                const price = text.match(/\$[0-9,.]+/)?.[0] || "Unknown";
                
                // 賣家誠信辨識 (更新正則表達式以修正 99.6% 變 6% 的問題)
                const feedbackMatch = text.match(/(\d+(\.\d+)?)%\s*(positive feedback|正面評價)/i);
                const joinedMatch = text.match(/(Joined|加入於)\s*(\d{4})/i);
                
                let urls = new Set();
                document.querySelectorAll('img').forEach(img => {
                    if (img.src && (img.src.includes('fbcdn') || img.src.includes('trademe'))) {
                        urls.add(img.src);
                    }
                });
                return { 
                    title, price, body: text.substring(0, 1000), 
                    imgUrls: Array.from(urls).slice(0, 8),
                    rating: feedbackMatch ? parseFloat(feedbackMatch[1]) : null,
                    year: joinedMatch ? parseInt(joinedMatch[2]) : null
                };
            }
        });

        const data = injection[0].result;

        // --- 顯示賣家警報 ---
        if (data.rating !== null || data.year !== null) {
            let alertMsg = "";
            let alertClass = "alert-success";
            const curYear = new Date().getFullYear();

            if (data.rating !== null && data.rating < 95) {
                alertMsg = `⚠️ <b>警告：評價較低！</b><br>賣家好評率僅 ${data.rating}%。`;
                alertClass = "alert-danger";
            } else if (data.year && curYear - data.year <= 1) {
                alertMsg = `🚩 <b>提醒：新帳號</b><br>賣家於 ${data.year} 年加入。`;
                alertClass = "alert-warning";
            } else {
                alertMsg = `✅ <b>賣家信用良好</b> (${data.rating || '--'}%)`;
            }
            alertDiv.innerHTML = alertMsg;
            alertDiv.className = alertClass;
            alertDiv.style.display = "block";
        }

        // --- 處理並預覽圖片 ---
        const imagesB64 = [];
        for (let i = 0; i < data.imgUrls.length; i++) {
            const url = data.imgUrls[i];
            const pImg = document.createElement('img');
            pImg.src = url;
            pImg.className = 'preview-img';
            previewDiv.appendChild(pImg);

            try {
                const b64 = await processImage(url);
                imagesB64.push(b64);
            } catch (e) { console.error("Image load fail"); }
        }

        // --- 發送至 AI ---
        statusText.innerText = "🚀 正在進行行情分析...";
        const payload = {
            system_instruction: {
                parts: [{ text: "你是一位精煉且具備維修背景的奧克蘭二手市場轉賣專家。專精fb和trademe. 1. 繁體中文。2. 禁止開場白。3. 思考層級：高。只分析賣家提供的商品資訊，忽略不相關的網頁雜訊, e.g .Sellers other listings / Other listings you might like. " }]
            },
            contents: [{
                parts: [
                    { text: `分析：${data.title} / 價格: ${data.price}\n\n格式：\n- **商品/型號細節**：\n- **缺陷檢測**：\n- **新品價格**：\n- **中性二手行情估值**：\n- **流動性**：\n- **最終決策**：` },
                    ...imagesB64.map(b64 => ({ inline_data: { mime_type: "image/jpeg", data: b64 } }))
                ]
            }],
            generationConfig: { 
                temperature: 0.1,
                thinkingConfig: { thinkingLevel: "high" }
            }
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const json = await response.json();
        resultDiv.innerHTML = json.candidates[0].content.parts[0].text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    } catch (err) {
        resultDiv.innerHTML = `<span style="color:red">❌ 錯誤: ${err.message}</span>`;
    } finally {
        btn.disabled = false;
    }
});

async function processImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
        };
        img.onerror = reject;
        img.src = url;
    });
}

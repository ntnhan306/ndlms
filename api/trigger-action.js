// Serverless Function (Ví dụ: Vercel/Netlify) - Đặt trong thư mục 'api'

const axios = require('axios');
const Busboy = require('busboy');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Chỉ hỗ trợ phương thức POST');
    }

    // 1. Lấy Token từ môi trường triển khai (Được đặt tên là DISPATCH_TOKEN)
    const DISPATCH_TOKEN = process.env.DISPATCH_TOKEN; 

    if (!DISPATCH_TOKEN) {
        return res.status(500).json({ message: 'Lỗi cấu hình: Biến DISPATCH_TOKEN không tồn tại.' });
    }

    const formData = { owner: null, repo: null, branch: null, files: [] };
    
    // Xử lý files và data (giống phần trước)
    await new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: req.headers });
        
        busboy.on('field', (fieldname, val) => { formData[fieldname] = val; });
        busboy.on('file', (fieldname, file, filenameInfo) => {
            const chunks = [];
            file.on('data', data => chunks.push(data));
            file.on('end', () => {
                // Mã hóa Base64 cho nội dung file để truyền qua payload Action
                formData.files.push({
                    filename: filenameInfo.filename,
                    content_base64: Buffer.concat(chunks).toString('base64')
                });
            });
        });
        busboy.on('finish', resolve);
        busboy.on('error', reject);
        req.pipe(busboy);
    });

    const { owner, repo, branch, files } = formData;
    if (!owner || !repo || !branch || files.length === 0) {
        return res.status(400).json({ message: 'Thiếu thông tin hoặc file.' });
    }

    try {
        // 2. Kích hoạt GitHub Action bằng API repository_dispatch
        const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/dispatches`;
        
        await axios.post(dispatchUrl, {
            event_type: 'upload_files_commit', // Tên event mà uploader.yml sẽ lắng nghe
            client_payload: {
                branch: branch,
                commit_message: '.',
                files_payload: JSON.stringify(files) // Truyền files dưới dạng chuỗi JSON
            }
        }, {
            headers: {
                'Authorization': `token ${DISPATCH_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
        });

        // 3. Trả về thành công (Action đang chạy)
        res.status(200).json({
            message: 'Yêu cầu upload đã được gửi thành công. GitHub Action đang xử lý commit.',
            action_url: `https://github.com/${owner}/${repo}/actions`
        });

    } catch (error) {
        console.error('Lỗi khi kích hoạt Action:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            message: 'Lỗi khi gọi GitHub API để kích hoạt Action.',
            detail: error.response ? error.response.data.message : error.message
        });
    }
};

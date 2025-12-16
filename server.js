const express = require('express');
const multer = require('multer'); 
const axios = require('axios');
const cors = require('cors'); 
// Lưu ý: require('dotenv').config() chỉ dùng để chạy local. 
// Khi deploy, môi trường server sẽ tự cung cấp biến TOKEN.

const app = express();
const upload = multer(); 
const PORT = process.env.PORT || 3000; // Sử dụng cổng của môi trường nếu có

// Cấu hình CORS
app.use(cors({
    origin: '*', 
}));

// LẤY TOKEN TỪ BIẾN MÔI TRƯỜNG SERVER (GitHub Secret, Vercel Env, Heroku Env,...)
const GITHUB_TOKEN = process.env.TOKEN;
const API_BASE = 'https://api.github.com/repos/';

/**
 * Endpoint xử lý upload file.
 * Logic phức tạp để commit nhiều file trong 1 lần.
 */
app.post('/api/upload-github', upload.array('files'), async (req, res) => {
    // 1. Kiểm tra Token
    if (!GITHUB_TOKEN) {
        // Thông báo lỗi nếu biến môi trường TOKEN chưa được cấu hình trên server
        return res.status(500).json({ message: 'Lỗi cấu hình server: Biến môi trường TOKEN không tồn tại.' });
    }

    const { owner, repo, branch, commitMessage } = req.body;
    const files = req.files; 

    if (!owner || !repo || !branch || !files || files.length === 0) {
        return res.status(400).json({ message: 'Thiếu thông tin Owner, Repo, Branch, hoặc File.' });
    }

    const rawUrls = [];
    const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };

    try {
        // --- 1. Lấy SHA của commit HEAD hiện tại ---
        const refUrl = `${API_BASE}${owner}/${repo}/git/refs/heads/${branch}`;
        const { data: refData } = await axios.get(refUrl, { headers });
        const baseCommitSha = refData.object.sha;

        // --- 2. Lấy Tree SHA của commit base ---
        const { data: commitData } = await axios.get(`${API_BASE}${owner}/${repo}/git/commits/${baseCommitSha}`, { headers });
        const baseTreeSha = commitData.tree.sha;

        // --- 3. Tạo Blob và chuẩn bị nội dung cho New Tree ---
        const treeItems = [];
        for (const file of files) {
            const contentBase64 = file.buffer.toString('base64');
            const path = file.originalname;

            // Tạo Blob
            const { data: blobData } = await axios.post(`${API_BASE}${owner}/${repo}/git/blobs`, {
                content: contentBase64,
                encoding: 'base64'
            }, { headers });
            
            treeItems.push({
                path: path,
                mode: '100644', 
                type: 'blob',
                sha: blobData.sha
            });

            // Tạo đường link raw
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
            rawUrls.push(rawUrl);
        }

        // --- 4. Tạo New Tree ---
        const { data: newTreeData } = await axios.post(`${API_BASE}${owner}/${repo}/git/trees`, {
            base_tree: baseTreeSha,
            tree: treeItems
        }, { headers });

        // --- 5. Tạo New Commit ---
        const { data: newCommitData } = await axios.post(`${API_BASE}${owner}/${repo}/git/commits`, {
            message: commitMessage, 
            tree: newTreeData.sha,
            parents: [baseCommitSha]
        }, { headers });

        // --- 6. Cập nhật HEAD (ref) ---
        await axios.patch(refUrl, {
            sha: newCommitData.sha
        }, { headers });

        // --- 7. Trả về kết quả và link raw ---
        res.status(200).json({
            message: 'Tải lên và commit thành công!',
            commitSha: newCommitData.sha,
            rawUrls: rawUrls 
        });

    } catch (error) {
        console.error('Lỗi GitHub API:', error.response ? error.response.data : error.message);
        const status = error.response ? error.response.status : 500;
        res.status(status).json({ 
            message: `Lỗi khi gọi GitHub API (Status: ${status})`,
            detail: error.response ? error.response.data.message : error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server Backend đang chạy tại port ${PORT}`);
});

import React, { useState, useEffect } from 'react';
import './TokenConfig.css';

const TokenConfig = () => {
  const [tokens, setTokens] = useState([]);
  const [newToken, setNewToken] = useState({ name: '', address: '' });
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editingToken, setEditingToken] = useState({ name: '', address: '' });

  // 从localStorage加载已配置的币种
  useEffect(() => {
    const savedTokens = localStorage.getItem('configuredTokens');
    if (savedTokens) {
      setTokens(JSON.parse(savedTokens));
    } else {
      // 默认添加BSC上的知名币种
      const defaultTokens = [
        { name: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955' },
        { name: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' },
        { name: 'BUSD', address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' },
        { name: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' },
        { name: 'CAKE', address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' }
      ];
      setTokens(defaultTokens);
      localStorage.setItem('configuredTokens', JSON.stringify(defaultTokens));
    }
  }, []);

  // 保存币种到localStorage
  const saveTokens = (updatedTokens) => {
    setTokens(updatedTokens);
    localStorage.setItem('configuredTokens', JSON.stringify(updatedTokens));
  };

  // 添加新币种
  const addToken = () => {
    if (!newToken.name.trim() || !newToken.address.trim()) {
      alert('请填写完整的币种名称和地址！');
      return;
    }

    // 检查是否已存在相同的币种
    const exists = tokens.some(token => 
      token.name.toLowerCase() === newToken.name.toLowerCase() || 
      token.address.toLowerCase() === newToken.address.toLowerCase()
    );

    if (exists) {
      alert('该币种或地址已存在！');
      return;
    }

    // 简单验证地址格式（以0x开头，42个字符）
    if (!newToken.address.match(/^0x[a-fA-F0-9]{40}$/)) {
      alert('请输入有效的以太坊地址格式！');
      return;
    }

    const updatedTokens = [...tokens, { ...newToken }];
    saveTokens(updatedTokens);
    setNewToken({ name: '', address: '' });
  };

  // 删除币种
  const deleteToken = (index) => {
    if (window.confirm('确定要删除这个币种配置吗？')) {
      const updatedTokens = tokens.filter((_, i) => i !== index);
      saveTokens(updatedTokens);
    }
  };

  // 开始编辑
  const startEdit = (index) => {
    setEditingIndex(index);
    setEditingToken({ ...tokens[index] });
  };

  // 保存编辑
  const saveEdit = () => {
    if (!editingToken.name.trim() || !editingToken.address.trim()) {
      alert('请填写完整的币种名称和地址！');
      return;
    }

    // 检查是否与其他币种重复（排除当前编辑的）
    const exists = tokens.some((token, index) => 
      index !== editingIndex && (
        token.name.toLowerCase() === editingToken.name.toLowerCase() || 
        token.address.toLowerCase() === editingToken.address.toLowerCase()
      )
    );

    if (exists) {
      alert('该币种或地址已存在！');
      return;
    }

    // 验证地址格式
    if (!editingToken.address.match(/^0x[a-fA-F0-9]{40}$/)) {
      alert('请输入有效的以太坊地址格式！');
      return;
    }

    const updatedTokens = tokens.map((token, index) => 
      index === editingIndex ? editingToken : token
    );
    saveTokens(updatedTokens);
    setEditingIndex(-1);
    setEditingToken({ name: '', address: '' });
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingIndex(-1);
    setEditingToken({ name: '', address: '' });
  };

  // 格式化地址显示
  const formatAddress = (address) => {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  return (
    <div className="token-config">
      <h2>🔧 币种配置</h2>
      <p className="config-description">
        在这里配置您想要交易的币种信息，包括币种名称和合约地址
      </p>

      {/* 添加新币种区域 */}
      <div className="add-token-section">
        <h3>➕ 添加新币种</h3>
        <div className="input-row">
          <div className="input-group">
            <label>币种名称</label>
            <input
              type="text"
              placeholder="例如: USDT"
              value={newToken.name}
              onChange={(e) => setNewToken({ ...newToken, name: e.target.value })}
              className="token-input"
            />
          </div>
          <div className="input-group">
            <label>合约地址</label>
            <input
              type="text"
              placeholder="0x..."
              value={newToken.address}
              onChange={(e) => setNewToken({ ...newToken, address: e.target.value })}
              className="token-input"
            />
          </div>
          <button onClick={addToken} className="add-button">
            添加币种
          </button>
        </div>
      </div>

      {/* 已配置币种列表 */}
      <div className="tokens-list-section">
        <h3>📋 已配置币种 ({tokens.length})</h3>
        {tokens.length === 0 ? (
          <div className="empty-state">
            <p>还没有配置任何币种</p>
            <p>请添加您想要交易的币种</p>
          </div>
        ) : (
          <div className="tokens-grid">
            {tokens.map((token, index) => (
              <div key={index} className="token-card">
                {editingIndex === index ? (
                  // 编辑模式
                  <div className="edit-mode">
                    <div className="edit-inputs">
                      <input
                        type="text"
                        value={editingToken.name}
                        onChange={(e) => setEditingToken({ ...editingToken, name: e.target.value })}
                        className="edit-input"
                        placeholder="币种名称"
                      />
                      <input
                        type="text"
                        value={editingToken.address}
                        onChange={(e) => setEditingToken({ ...editingToken, address: e.target.value })}
                        className="edit-input"
                        placeholder="合约地址"
                      />
                    </div>
                    <div className="edit-actions">
                      <button onClick={saveEdit} className="save-button">保存</button>
                      <button onClick={cancelEdit} className="cancel-button">取消</button>
                    </div>
                  </div>
                ) : (
                  // 显示模式
                  <div className="display-mode">
                    <div className="token-info">
                      <div className="token-name">{token.name}</div>
                      <div className="token-address" title={token.address}>
                        {formatAddress(token.address)}
                      </div>
                    </div>
                    <div className="token-actions">
                      <button 
                        onClick={() => startEdit(index)} 
                        className="edit-button"
                        title="编辑"
                      >
                        ✏️
                      </button>
                      <button 
                        onClick={() => deleteToken(index)} 
                        className="delete-button"
                        title="删除"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 使用提示 */}
      <div className="tips-section">
        <h3>💡 使用提示</h3>
        <ul>
          <li>合约地址必须是有效的以太坊地址格式（0x开头，42个字符）</li>
          <li>不同网络的同一币种需要使用对应网络的合约地址</li>
          <li>建议从官方渠道获取准确的合约地址</li>
          <li>配置完成后可以在兑换页面使用这些币种</li>
        </ul>
      </div>
    </div>
  );
};

export default TokenConfig; 
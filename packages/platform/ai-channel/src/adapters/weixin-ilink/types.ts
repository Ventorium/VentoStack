/** iLink 协议数据结构（字段名与官方文档保持一致，便于对照排查） */

/** 消息项类型：1 文本 / 2 图片 / 3 语音 / 4 文件 / 5 视频 / 11 工具调用开始 / 12 工具结果 */
export interface WeixinItem {
  type?: number;
  text_item?: { text?: string };
  voice_item?: { text?: string };
}

export interface WeixinMessage {
  /** 平台消息 id（幂等键） */
  message_id?: string;
  /** 发送者：<id>@im.wechat */
  from_user_id?: string;
  to_user_id?: string;
  /** 1 用户 / 2 机器人 —— 只处理 1，过滤自己发的回环 */
  message_type?: number;
  /** 0 新建 / 1 生成中 / 2 完成 —— 只处理 2 */
  message_state?: number;
  item_list?: WeixinItem[];
  /** 回复时必须原样回传 */
  context_token?: string;
  /** 群 id（本设计不支持群聊，非空即丢弃） */
  group_id?: string;
}

export interface WeixinQrStatus {
  status?: string;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
  redirect_host?: string;
  /** 需要输入验证码时的提示 */
  verify_code_blocked?: boolean;
}

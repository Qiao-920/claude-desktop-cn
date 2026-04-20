import { UsersRound } from 'lucide-react';
import { getStoredUiLanguage } from '../utils/chineseClientText';

const CoworkPage = () => {
  const isZh = getStoredUiLanguage() === 'zh-CN';

  return (
    <div className="h-full bg-claude-bg text-claude-text flex items-center justify-center px-6">
      <div className="max-w-[520px] text-center">
        <div className="mx-auto w-14 h-14 rounded-lg border border-claude-border flex items-center justify-center text-claude-textSecondary mb-5">
          <UsersRound size={26} />
        </div>
        <h1 className="text-[22px] font-semibold mb-2">{isZh ? '协作工作区' : 'Cowork workspace'}</h1>
        <p className="text-[14px] leading-6 text-claude-textSecondary">
          {isZh
            ? '这里会放多人协作、共享任务、项目状态和审阅流程。入口已经接通，后续功能可以直接在这里继续补。'
            : 'Shared tasks, project state, and review flows will live here. The entry point is wired and ready for the next layer.'}
        </p>
      </div>
    </div>
  );
};

export default CoworkPage;

import { Input, Modal, Spacer, Text, Toggle, useInput } from '@geist-ui/core';
import { ModalHooksBindings } from '@geist-ui/core/dist/use-modal';
import { BindingsChangeTarget } from '@geist-ui/core/esm/use-input/use-input';
import { trpc } from '@utils/trpc';
import { Config, ConfigValue } from '@utils/types';
import React, { MutableRefObject, useState } from 'react';

const getConfigValue = <T,>(conf: Config | undefined, edit: string | undefined, target: keyof ConfigValue[string]) =>
  conf?.values?.[edit ?? '']?.[target] as T | undefined;

export const EditConfigValueModal: React.FC<{
  onCloseModel: () => void;
  bindings: ModalHooksBindings;
  config: MutableRefObject<Config | undefined>;
  editValue?: string;
}> = ({ bindings, config, onCloseModel, editValue }) => {
  const { state: keyValue, setState: setKey, bindings: propertyBinding } = useInput(editValue ?? '');
  const {
    state: valueValue,
    setState: setValue,
    bindings: valueBinding,
  } = useInput(getConfigValue<string>(config.current, editValue, 'value') ?? '');
  const [hidden, setHidden] = useState(getConfigValue<boolean>(config.current, editValue, 'hidden') ?? false);
  const updateConfig = trpc.useMutation('config-update');
  const [invalid, setInvalid] = useState<undefined | string>(undefined);

  if (!config.current) {
    return <></>;
  }

  const configMap = new Map(Object.entries(config.current.values));

  const tryAddValue = () => {
    const key = keyValue.trim();
    const value = { value: valueValue, hidden };

    if (!key) {
      setKey(key);
      setInvalid('Invalid property name');
      return;
    }

    if (!editValue && configMap.has(key)) {
      setInvalid('Property already exists in config');
      return;
    }

    configMap.set(key, value);

    updateConfig.mutate(
      {
        projectId: config.current!.projectId,
        configId: config.current!.id,
        values: Object.fromEntries(configMap),
      },
      {
        onSuccess: () => {
          clearInput();
          onCloseModel();
        },
      }
    );
  };

  const clearInput = () => {
    setInvalid(undefined);
    setKey('');
    setValue('');
    setHidden(false);
  };

  const modalClose = () => {
    clearInput();

    if (bindings.onClose) {
      bindings.onClose();
    }

    onCloseModel();
  };

  const onInputChange = (binding: (event: BindingsChangeTarget) => void) => {
    return (event: BindingsChangeTarget) => {
      setInvalid(undefined);
      binding(event);
    };
  };

  return (
    <Modal visible={bindings.visible} onClose={modalClose}>
      <Modal.Title>Add secret</Modal.Title>
      <Modal.Content>
        <Input
          disabled={!!editValue}
          placeholder="Property"
          value={propertyBinding.value}
          onChange={onInputChange(propertyBinding.onChange)}
          width="100%"
        />
        <Spacer />
        <Input
          placeholder="Value"
          value={valueBinding.value}
          onChange={onInputChange(valueBinding.onChange)}
          width="100%"
        />
        <Spacer />
        <div className="flex items-center gap-2">
          <label htmlFor="hiddenToggle">Hidden</label>
          <Toggle id="hiddenToggle" padding={0} initialChecked={hidden} onChange={(e) => setHidden(e.target.checked)} />
        </div>
        <Text p type="error">
          {invalid}
        </Text>
      </Modal.Content>
      <Modal.Action onClick={modalClose}>Cancel</Modal.Action>
      <Modal.Action onClick={tryAddValue}>{!editValue ? 'Create' : 'Update'}</Modal.Action>
    </Modal>
  );
};
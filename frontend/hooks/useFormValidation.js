import { useState } from 'react';

export function useFormValidation(initialErrors = {}) {
    const [errors, setErrors] = useState(initialErrors);
    const [touched, setTouched] = useState({});

    const validateRequired = (value, fieldName) => {
        if (!value || (typeof value === 'string' && !value.trim())) {
            return `${fieldName} is required`;
        }
        return null;
    };

    const validateEmail = (value) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (value && !emailRegex.test(value)) {
            return 'Invalid email format';
        }
        return null;
    };

    const validateMinLength = (value, min, fieldName) => {
        if (value && value.length < min) {
            return `${fieldName} must be at least ${min} characters`;
        }
        return null;
    };

    const validateNumber = (value, fieldName) => {
        if (value && isNaN(Number(value))) {
            return `${fieldName} must be a number`;
        }
        return null;
    };

    const validateField = (name, value, rules) => {
        const errorMessages = [];

        if (rules.required) {
            const error = validateRequired(value, rules.label || name);
            if (error) errorMessages.push(error);
        }

        if (rules.email) {
            const error = validateEmail(value);
            if (error) errorMessages.push(error);
        }

        if (rules.minLength) {
            const error = validateMinLength(value, rules.minLength, rules.label || name);
            if (error) errorMessages.push(error);
        }

        if (rules.number) {
            const error = validateNumber(value, rules.label || name);
            if (error) errorMessages.push(error);
        }

        if (rules.custom) {
            const error = rules.custom(value);
            if (error) errorMessages.push(error);
        }

        return errorMessages;
    };

    const validateForm = (values, validationRules) => {
        const newErrors = {};
        let isValid = true;

        Object.keys(validationRules).forEach(field => {
            const fieldErrors = validateField(
                field,
                values[field],
                validationRules[field]
            );

            if (fieldErrors.length > 0) {
                newErrors[field] = fieldErrors;
                isValid = false;
            }
        });

        setErrors(newErrors);
        return isValid;
    };

    const handleBlur = (fieldName) => {
        setTouched(prev => ({ ...prev, [fieldName]: true }));
    };

    const clearErrors = (fieldName) => {
        if (fieldName) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[fieldName];
                return newErrors;
            });
        } else {
            setErrors({});
        }
    };

    const reset = () => {
        setErrors({});
        setTouched({});
    };

    return {
        errors,
        touched,
        validateForm,
        validateField,
        handleBlur,
        clearErrors,
        reset,
        hasErrors: Object.keys(errors).length > 0
    };
}

export default useFormValidation;